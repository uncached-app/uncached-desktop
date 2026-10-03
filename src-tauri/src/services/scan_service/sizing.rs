//! Measuring targets after the walk finds them: the worker pool, its jobs, and
//! settling each result back into the registry.

use super::*;

pub(super) struct SizingJob {
    pub(super) scan_id: String,
    pub(super) target_id: String,
    pub(super) path: PathBuf,
}

pub(super) type SizeCalculator =
    Arc<dyn Fn(&Path) -> crate::filesystem::size::DirSize + Send + Sync>;
pub(super) type EventSink = Arc<dyn Fn(&str, serde_json::Value) + Send + Sync>;

pub(super) struct SizingController {
    pub(super) sender: Option<SyncSender<SizingJob>>,
    pub(super) workers: Vec<std::thread::JoinHandle<()>>,
    pub(super) cancel_token: Arc<AtomicBool>,
}

#[derive(Clone)]
pub(super) struct SizingSubmitter {
    pub(super) sender: SyncSender<SizingJob>,
    pub(super) cancel_token: Arc<AtomicBool>,
}

pub(super) fn sizing_worker_count() -> usize {
    std::thread::available_parallelism()
        .map(|count| count.get().clamp(1, 8))
        .unwrap_or(1)
}

impl SizingController {
    pub(super) fn new(
        app: &AppHandle,
        stats: &Arc<Mutex<ScanStats>>,
        started_at: Instant,
        cancel_token: Arc<AtomicBool>,
    ) -> Self {
        let event_sink = {
            let app = app.clone();
            Arc::new(move |event: &str, payload: serde_json::Value| {
                let _ = app.emit(event, payload);
            })
        };
        let sizing_cancel_token = Arc::clone(&cancel_token);
        let calculator: SizeCalculator =
            Arc::new(
                move |path| match uncached_core::filesystem::directory_size_report_with_cancel(
                    path,
                    &sizing_cancel_token,
                ) {
                    Ok(Some(report)) => report,
                    Ok(None) | Err(_) => crate::filesystem::size::DirSize {
                        bytes: 0,
                        errors: 1,
                        newest_modified: None,
                    },
                },
            );
        Self::with_hooks(
            sizing_worker_count(),
            calculator,
            event_sink,
            cancel_token,
            stats,
            started_at,
        )
    }

    pub(super) fn with_hooks(
        workers: usize,
        calculator: SizeCalculator,
        event_sink: EventSink,
        cancel_token: Arc<AtomicBool>,
        stats: &Arc<Mutex<ScanStats>>,
        started_at: Instant,
    ) -> Self {
        let (sender, receiver) = sync_channel::<SizingJob>(workers * 2);
        let receiver = Arc::new(Mutex::new(receiver));
        let mut worker_handles = Vec::with_capacity(workers);

        for _ in 0..workers {
            let receiver = Arc::clone(&receiver);
            let stats = Arc::clone(stats);
            let calculator = Arc::clone(&calculator);
            let event_sink = Arc::clone(&event_sink);
            let cancel_token = Arc::clone(&cancel_token);
            worker_handles.push(std::thread::spawn(move || loop {
                let job = lock(&receiver).recv();
                let Ok(job) = job else {
                    break;
                };
                if cancel_token.load(Ordering::Acquire) {
                    break;
                }
                let report = calculator(&job.path);
                if cancel_token.load(Ordering::Acquire) {
                    settle_size_job(
                        &job.scan_id,
                        &job.target_id,
                        &stats,
                        started_at,
                        &event_sink,
                        None,
                    );
                    continue;
                }
                let applied = apply_target_size_and_emit_for_session(
                    &job.scan_id,
                    &job.target_id,
                    report,
                    &event_sink,
                );
                if applied.is_some() {
                    crate::logging::info(
                        "size",
                        &format!(
                            "targetPath=\"{}\" bytes={} errors={}",
                            job.path.display(),
                            report.bytes,
                            report.errors
                        ),
                    );
                } else {
                    crate::logging::info(
                        "size",
                        &format!(
                            "discarded targetId=\"{}\" scanId=\"{}\"",
                            job.target_id, job.scan_id
                        ),
                    );
                }
                settle_size_job(
                    &job.scan_id,
                    &job.target_id,
                    &stats,
                    started_at,
                    &event_sink,
                    (applied.is_some() && report.errors == 0).then_some(report.bytes),
                );
            }));
        }

        Self {
            sender: Some(sender),
            workers: worker_handles,
            cancel_token,
        }
    }

    pub(super) fn submitter(&self) -> SizingSubmitter {
        SizingSubmitter {
            sender: self.sender.as_ref().unwrap().clone(),
            cancel_token: Arc::clone(&self.cancel_token),
        }
    }

    pub(super) fn finish(mut self) {
        self.sender.take();
        for worker in self.workers {
            let _ = worker.join();
        }
    }

    #[cfg(test)]
    pub(super) fn for_test(
        workers: usize,
        calculator: SizeCalculator,
        event_sink: EventSink,
    ) -> Self {
        Self::for_test_with_cancel(
            workers,
            calculator,
            event_sink,
            Arc::new(AtomicBool::new(false)),
        )
    }

    #[cfg(test)]
    pub(super) fn for_test_with_cancel(
        workers: usize,
        calculator: SizeCalculator,
        event_sink: EventSink,
        cancel_token: Arc<AtomicBool>,
    ) -> Self {
        let stats = Arc::new(Mutex::new(ScanStats::default()));
        Self::with_hooks(
            workers,
            calculator,
            event_sink,
            cancel_token,
            &stats,
            Instant::now(),
        )
    }
}

impl SizingSubmitter {
    pub(super) fn submit(&self, mut job: SizingJob) -> bool {
        loop {
            match self.sender.try_send(job) {
                Ok(()) => return true,
                Err(TrySendError::Disconnected(_)) => return false,
                Err(TrySendError::Full(returned)) => {
                    if self.cancel_token.load(Ordering::Acquire) {
                        return false;
                    }
                    job = returned;
                    std::thread::yield_now();
                }
            }
        }
    }
}

pub(super) fn apply_target_size_and_emit_for_session(
    scan_id: &str,
    target_id: &str,
    report: crate::filesystem::size::DirSize,
    event_sink: &EventSink,
) -> Option<TargetSizeUpdate> {
    let update = {
        let mut registry = lock(registry());
        let accepted = registry
            .sessions
            .get(scan_id)
            .is_some_and(|session| !session.cancelled && session.target_ids.contains(target_id));
        if !accepted {
            return None;
        }
        registry
            .sessions
            .get_mut(scan_id)
            .unwrap()
            .publishing_target_ids
            .insert(target_id.to_string());
        let registered = match registry.targets.get_mut(target_id) {
            Some(registered) => registered,
            None => {
                registry
                    .sessions
                    .get_mut(scan_id)
                    .unwrap()
                    .publishing_target_ids
                    .remove(target_id);
                return None;
            }
        };
        registered.target.set_size(report.bytes, report.errors > 0);
        registered.target.last_used_at = report.newest_modified;
        TargetSizeUpdate {
            scan_id: scan_id.to_string(),
            target_id: target_id.to_string(),
            size_bytes: registered.target.size_bytes,
            last_used_at: registered.target.last_used_at,
            size_has_errors: registered.target.size_has_errors,
            size_pending: registered.target.size_pending,
            formatted_size: registered.target.formatted_size.clone(),
        }
    };
    // Cancellation defers target removal while this barrier is active. The sink runs outside
    // the registry lock, so sinks may safely call registry lifecycle methods.
    event_sink(
        "scan:target_sized",
        serde_json::to_value(target_sized_event(&update)).unwrap(),
    );
    complete_target_publication(scan_id, target_id);
    Some(update)
}

#[cfg(test)]
pub(super) fn apply_target_size_for_session(
    scan_id: &str,
    target_id: &str,
    report: crate::filesystem::size::DirSize,
) -> Option<TargetSizeUpdate> {
    let mut registry = lock(registry());
    let session = registry.sessions.get(scan_id)?;
    if !session.target_ids.contains(target_id) {
        return None;
    }
    let registered = registry.targets.get_mut(target_id)?;
    registered.target.set_size(report.bytes, report.errors > 0);
    registered.target.last_used_at = report.newest_modified;
    Some(TargetSizeUpdate {
        scan_id: scan_id.to_string(),
        target_id: target_id.to_string(),
        size_bytes: registered.target.size_bytes,
        last_used_at: registered.target.last_used_at,
        size_has_errors: registered.target.size_has_errors,
        size_pending: registered.target.size_pending,
        formatted_size: registered.target.formatted_size.clone(),
    })
}

pub(super) fn settle_size_job(
    scan_id: &str,
    target_id: &str,
    stats: &Arc<Mutex<ScanStats>>,
    started_at: Instant,
    event_sink: &EventSink,
    measured_bytes: Option<u64>,
) {
    let (cancelled, should_finish) = {
        let mut registry = lock(registry());
        let Some(session) = registry.sessions.get_mut(scan_id) else {
            return;
        };
        if !session.settle_size_job(target_id) {
            return;
        }
        let cancelled = session.cancelled;
        if session.can_finish() {
            session.finished = true;
            registry.sessions.remove(scan_id);
            (cancelled, true)
        } else {
            (cancelled, false)
        }
    };
    if cancelled {
        return;
    }
    if let Some(bytes) = measured_bytes {
        let mut stats = lock(stats);
        stats.total_bytes_found = stats.total_bytes_found.saturating_add(bytes);
    }
    emit_progress(event_sink, scan_id, stats);
    if should_finish {
        emit_finished(event_sink, scan_id, stats, started_at);
    }
}

pub(super) fn complete_target_publication(scan_id: &str, target_id: &str) {
    let mut registry = lock(registry());
    let target_ids = {
        let Some(session) = registry.sessions.get_mut(scan_id) else {
            return;
        };
        session.publishing_target_ids.remove(target_id);
        if session.cancelled && session.publishing_target_ids.is_empty() {
            Some(session.target_ids.drain().collect::<Vec<_>>())
        } else {
            None
        }
    };
    if let Some(target_ids) = target_ids {
        registry.sessions.remove(scan_id);
        for target_id in target_ids {
            registry.in_flight.remove(&target_id);
            registry.targets.remove(&target_id);
        }
    }
}
