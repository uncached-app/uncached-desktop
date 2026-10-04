//! Starting, cancelling and finishing a scan session.

use super::*;

pub(super) fn scan_path(path: &Path) -> PathBuf {
    strip_extended_prefix(path)
}

pub(super) fn providers_for_scan(
    settings: &crate::settings::AppSettings,
) -> uncached_core::ProviderSet {
    get_default_providers(settings)
}

impl ScanService {
    pub fn start_scan(app: &AppHandle, root_paths: &[PathBuf]) -> NukeResult<ScanStartResult> {
        let limit = crate::entitlements::root_limit();
        let mut canonical = Vec::new();
        for root_path in root_paths {
            let metadata = std::fs::symlink_metadata(root_path)
                .map_err(|_| NukeError::NotFound(root_path.display().to_string()))?;
            if !metadata.is_dir() || metadata.file_type().is_symlink() {
                return Err(NukeError::NotADirectory(root_path.display().to_string()));
            }
            canonical.push(scan_path(&dunce::canonicalize(root_path)?));
        }
        // Nested roots collapse into the outermost before the plan limit
        // applies, so a redundant folder never costs the user a slot.
        let canonical = crate::scanner::outermost_roots(canonical);
        let requested = canonical.len();
        let scan_roots = canonical.into_iter().take(limit).collect::<Vec<_>>();
        if scan_roots.is_empty() {
            return Err(NukeError::NoScanRoot);
        }
        let roots_over_limit = requested.saturating_sub(scan_roots.len());
        let canonical_root = scan_roots[0].clone();
        let scan_root = canonical_root.clone();
        let scan_id = format!(
            "scan-{}",
            NEXT_SCAN_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        let result_scan_id = scan_id.clone();
        let worker_scan_id = scan_id.clone();
        crate::logging::info(
            "scan",
            &format!(
                "start scanId=\"{}\" roots={} overLimit={}",
                scan_id,
                scan_roots.len(),
                roots_over_limit
            ),
        );
        let session = ScanSession::new();
        let cancel_token = Arc::clone(&session.cancel_token);
        lock(registry()).sessions.insert(scan_id.clone(), session);
        let app_handle = app.clone();
        let _ = app.emit(
            "scan:started",
            value_event(serde_json::json!({
                "scanId": scan_id,
                "rootPath": scan_root.clone(),
                "roots": scan_roots.clone(),
                "rootsOverLimit": roots_over_limit,
            })),
        );

        std::thread::spawn(move || {
            let started_at = Instant::now();
            let settings = crate::settings::load_settings(&app_handle).unwrap_or_default();
            let providers = Arc::new(providers_for_scan(&settings));
            let target_event_sink: EventSink = {
                let app = app_handle.clone();
                Arc::new(move |event, payload| {
                    let _ = app.emit(event, payload);
                })
            };
            let discovery_event_sink = Arc::clone(&target_event_sink);
            let stats = Arc::new(Mutex::new(ScanStats::default()));
            let sizing =
                SizingController::new(&app_handle, &stats, started_at, Arc::clone(&cancel_token));
            let sizing_submitter = sizing.submitter();

            // One session, one root at a time. Each target keeps the root it
            // was found under, so cleanup still validates against its own.
            let progress_throttle = Arc::new(Mutex::new(ProgressThrottle::new(PROGRESS_INTERVAL)));
            let mut walk_result = Ok(uncached_core::TraversalOutcome::Completed { unreadable: 0 });
            for scan_root in &scan_roots {
                let observer = WalkObserver {
                    scan_id: worker_scan_id.clone(),
                    root: scan_root.clone(),
                    cancel_token: Arc::clone(&cancel_token),
                    providers: Arc::clone(&providers),
                    stats: Arc::clone(&stats),
                    registry: Arc::clone(registry()),
                    event_sink: Arc::clone(&target_event_sink),
                    throttle: Arc::clone(&progress_throttle),
                    submitter: sizing_submitter.clone(),
                };

                let core_cancel_token = Arc::clone(&cancel_token);
                walk_result = uncached_core::traverse_workspace(
                    scan_root,
                    &providers,
                    &core_cancel_token,
                    |entry| observer.on_entry(entry),
                );
                if !matches!(
                    walk_result,
                    Ok(uncached_core::TraversalOutcome::Completed { .. })
                ) {
                    break;
                }
            }

            if matches!(
                walk_result,
                Ok(uncached_core::TraversalOutcome::Completed { .. })
            ) {
                if let Some(home) = uncached_core::home_directory() {
                    discover_home_locations(
                        &RunningScan {
                            id: &worker_scan_id,
                            events: &discovery_event_sink,
                            stats: &stats,
                            cancel: &cancel_token,
                            sizing: &sizing_submitter,
                        },
                        &home,
                        &crate::scanner::discovery_categories(&settings),
                        &settings.ignore_rules,
                    );
                }
            }
            drop(sizing_submitter);

            match walk_result {
                Ok(uncached_core::TraversalOutcome::Cancelled) => {
                    crate::logging::info(
                        "scan",
                        &format!("cancelled scanId=\"{}\"", worker_scan_id),
                    );
                    let _ = ScanService::end_session(&worker_scan_id);
                    sizing.finish();
                    let _ =
                        app_handle.emit("scan:cancelled", cancelled_event(&worker_scan_id, &stats));
                    return;
                }
                Err(error) => {
                    crate::logging::warn(
                        "walker",
                        &format!("scanId=\"{}\" error=\"{}\"", worker_scan_id, error),
                    );
                    if !ScanService::end_session(&worker_scan_id) {
                        sizing.finish();
                        if cancel_token.load(Ordering::Acquire) {
                            let _ = app_handle
                                .emit("scan:cancelled", cancelled_event(&worker_scan_id, &stats));
                        }
                        return;
                    }
                    sizing.finish();
                    let _ = app_handle.emit(
                        "scan:failed",
                        scan_failed_event(
                            &worker_scan_id,
                            &NukeError::Internal("scan traversal failed".into()),
                        ),
                    );
                    return;
                }
                Ok(uncached_core::TraversalOutcome::Completed { unreadable }) => {
                    if unreadable > 0 {
                        lock(&stats).unreadable += unreadable as u64;
                        crate::logging::warn(
                            "walker",
                            &format!(
                                "scanId=\"{}\" unreadableDirectories={} note=\"grant Full Disk Access to read them\"",
                                worker_scan_id, unreadable
                            ),
                        );
                    }
                }
            }

            if !ScanService::mark_walk_finished(&worker_scan_id, &app_handle, &stats, started_at) {
                sizing.finish();
                if cancel_token.load(Ordering::Acquire) {
                    let _ =
                        app_handle.emit("scan:cancelled", cancelled_event(&worker_scan_id, &stats));
                }
                return;
            }
            sizing.finish();
            let stats = lock(&stats);
            crate::logging::info(
                "scan",
                &format!(
                    "finished scanId=\"{}\" directories={} targets={} bytes={} durationMs={}",
                    worker_scan_id,
                    stats.directories_scanned,
                    stats.targets_found,
                    stats.total_bytes_found,
                    started_at.elapsed().as_millis()
                ),
            );
        });

        Ok(ScanStartResult {
            scan_id: result_scan_id,
        })
    }

    /// How many scans are open right now.
    ///
    /// Sessions are a map and nothing here serialises them, which is fine while
    /// a person starts every scan — they cannot click twice at once, and a
    /// second scan they did ask for is theirs to have. It stops being fine with
    /// a scheduler: two scans over one folder register two target ids for the
    /// same directory, and `claim_target_for_cleanup` keys off the id, so both
    /// can be claimed and both handed to a cleanup. The core's identity check
    /// makes the loser fail rather than delete twice, but the user would read
    /// that failure as a bug rather than as a collision.
    ///
    /// So the caller that has no user behind it asks first and waits its turn.
    pub fn active_scan_count() -> usize {
        lock(registry()).sessions.len()
    }

    pub(super) fn mark_walk_finished(
        scan_id: &str,
        app: &AppHandle,
        stats: &Arc<Mutex<ScanStats>>,
        started_at: Instant,
    ) -> bool {
        let should_finish = {
            let mut registry = lock(registry());
            let Some(session) = registry.sessions.get_mut(scan_id) else {
                return false;
            };
            session.walk_finished = true;
            if session.can_finish() {
                session.finished = true;
                registry.sessions.remove(scan_id);
                true
            } else {
                false
            }
        };
        if should_finish {
            let app = app.clone();
            let event_sink: EventSink = Arc::new(move |event, payload| {
                let _ = app.emit(event, payload);
            });
            emit_finished(&event_sink, scan_id, stats, started_at);
        }
        true
    }

    pub fn cancel_scan(scan_id: &str) -> NukeResult<CancelScanResult> {
        let mut registry = lock(registry());
        let target_ids = {
            let Some(session) = registry.sessions.get_mut(scan_id) else {
                return Ok(CancelScanResult { cancelled: false });
            };
            if session.cancelled || session.finished {
                return Ok(CancelScanResult { cancelled: false });
            }

            session.cancel_token.store(true, Ordering::Release);
            session.cancelled = true;
            if session.publishing_target_ids.is_empty() {
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

        Ok(CancelScanResult { cancelled: true })
    }

    pub(super) fn end_session(scan_id: &str) -> bool {
        lock(registry()).sessions.remove(scan_id).is_some()
    }
}
