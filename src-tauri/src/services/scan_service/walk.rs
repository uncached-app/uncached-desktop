//! What the walk does with each directory it visits: count it, register and
//! queue a target it recognised, report progress at a bounded rate.

use super::*;

/// Everything the walk callback needs, owned, so the callback is one method and
/// can be driven without a window or a real directory tree.
pub(super) struct WalkObserver {
    pub(super) scan_id: String,
    /// The scan root being walked; each target keeps it for its cleanup check.
    pub(super) root: PathBuf,
    pub(super) cancel_token: Arc<AtomicBool>,
    pub(super) providers: Arc<uncached_core::ProviderSet>,
    pub(super) stats: Arc<Mutex<ScanStats>>,
    pub(super) registry: Arc<Mutex<ScanRegistry>>,
    pub(super) event_sink: EventSink,
    pub(super) throttle: Arc<Mutex<ProgressThrottle>>,
    pub(super) submitter: SizingSubmitter,
}

impl WalkObserver {
    pub(super) fn on_entry(
        &self,
        entry: &uncached_core::TraversalEntry,
    ) -> uncached_core::TraversalControl {
        if self.cancel_token.load(Ordering::Acquire) {
            return uncached_core::TraversalControl::Cancel;
        }
        // The guard never outlives a counter update or a snapshot:
        // `submit` below waits for a free worker, and a worker
        // settling a job needs these stats, so holding them
        // across it could stall the walk for good.
        lock(&self.stats).directories_scanned += 1;

        if let Some(category) = entry.category.clone() {
            let core_target = uncached_core::ScanTarget::new(entry.path.clone(), category, 0)
                .with_identity(entry.identity);
            let target = ScanTarget::from_core(&self.scan_id, core_target);
            if self.cancel_token.load(Ordering::Acquire) {
                return uncached_core::TraversalControl::Cancel;
            }
            lock(&self.stats).targets_found += 1;

            let mut registry = lock(&self.registry);
            let accepted = {
                let Some(session) = registry.sessions.get_mut(&self.scan_id) else {
                    return uncached_core::TraversalControl::Cancel;
                };
                if session.cancelled || session.cancel_token.load(Ordering::Acquire) {
                    false
                } else {
                    session.target_ids.insert(target.id.clone());
                    session.register_size_job(target.id.clone());
                    true
                }
            };
            if !accepted {
                return uncached_core::TraversalControl::Cancel;
            }
            registry.targets.insert(
                target.id.clone(),
                RegisteredTarget {
                    target: target.clone(),
                    root_path: self.root.clone(),
                    providers: Arc::clone(&self.providers),
                    owner: &[],
                },
            );
            drop(registry);
            emit_target_found(&self.event_sink, &self.scan_id, &target);
            crate::logging::info(
                "scan",
                &format!(
                    "target scanId=\"{}\" path=\"{}\" pending=true",
                    self.scan_id,
                    target.path.display()
                ),
            );
            if !self.submitter.submit(SizingJob {
                scan_id: self.scan_id.clone(),
                target_id: target.id.clone(),
                path: target.path.clone(),
            }) {
                return uncached_core::TraversalControl::Cancel;
            }
            return uncached_core::TraversalControl::Prune;
        }

        // Counted above for every directory; only the report is
        // limited. See `PROGRESS_INTERVAL`.
        if !lock(&self.throttle).ready_at(Instant::now()) {
            return uncached_core::TraversalControl::Continue;
        }
        let snapshot = {
            let stats = lock(&self.stats);
            serde_json::json!({
                "scanId": self.scan_id,
                "directoriesScanned": stats.directories_scanned,
                "targetsFound": stats.targets_found,
                "totalBytesFound": stats.total_bytes_found,
                "phase": stats.phase.as_wire()
            })
        };
        (self.event_sink)(
            "scan:progress",
            serde_json::to_value(value_event(snapshot)).unwrap(),
        );
        uncached_core::TraversalControl::Continue
    }
}
