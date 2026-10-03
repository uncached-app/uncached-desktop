//! Looking up registered targets and claiming them for cleanup.

use super::*;

impl ScanService {
    #[cfg(test)]
    pub fn get_target(target_id: &str) -> NukeResult<RegisteredTarget> {
        lock(registry())
            .targets
            .get(target_id)
            .cloned()
            .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))
    }

    /// Registered targets sitting inside any of `paths`, ready to be cleaned.
    ///
    /// The containment test is `Path::starts_with`, which compares whole
    /// components: `/w/api-old` is not inside `/w/api` however the two are
    /// spelled. It is done here rather than in the caller because deciding
    /// which registered target belongs to a selected project is a decision
    /// about what may be deleted, and those live in Rust.
    ///
    /// A target that is not cleanable, or whose size has not settled, is left
    /// out rather than returned to fail later: the backend refuses both, and a
    /// run that hands back errors for work it was never going to do is a run
    /// that cannot be read.
    pub fn targets_under(paths: &[PathBuf]) -> Vec<String> {
        let registry = lock(registry());
        let mut ids: Vec<String> = registry
            .targets
            .iter()
            .filter(|(_, registered)| registered.target.cleanup_ready())
            .filter(|(_, registered)| {
                paths
                    .iter()
                    .any(|selected| registered.target.path.starts_with(selected))
            })
            .map(|(id, _)| id.clone())
            .collect();
        // The registry is a map, so its order is not an order. Cleanup is
        // reported as it happens and the sequence has to be the same twice.
        ids.sort();
        ids
    }

    pub fn refresh_target_size(target_id: &str) -> NukeResult<TargetSizeUpdate> {
        let path = {
            let mut registry = lock(registry());
            let registered = registry
                .targets
                .get_mut(target_id)
                .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))?;
            registered.target.size_pending = true;
            registered.target.path.clone()
        };
        let report = crate::filesystem::size::calculate_dir_size_report(&path);
        Self::apply_target_size(target_id, report)
            .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))
    }

    pub(super) fn apply_target_size(
        target_id: &str,
        report: crate::filesystem::size::DirSize,
    ) -> Option<TargetSizeUpdate> {
        let mut registry = lock(registry());
        let registered = registry.targets.get_mut(target_id)?;
        registered.target.set_size(report.bytes, report.errors > 0);
        registered.target.last_used_at = report.newest_modified;
        Some(TargetSizeUpdate {
            scan_id: scan_id_from_target_id(target_id),
            target_id: target_id.to_string(),
            size_bytes: registered.target.size_bytes,
            last_used_at: registered.target.last_used_at,
            size_has_errors: registered.target.size_has_errors,
            size_pending: registered.target.size_pending,
            formatted_size: registered.target.formatted_size.clone(),
        })
    }

    pub fn claim_target_for_cleanup(
        target_id: &str,
    ) -> NukeResult<(RegisteredTarget, Arc<CleanupControl>)> {
        let mut registry = lock(registry());
        if registry.in_flight.contains(target_id) {
            return Err(NukeError::PermissionDenied(
                "Target cleanup is already in progress".to_string(),
            ));
        }

        let target = registry
            .targets
            .get(target_id)
            .cloned()
            .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))?;
        if target.target.size_pending || target.target.size_has_errors {
            return Err(NukeError::PermissionDenied(
                "Target size is not ready".to_string(),
            ));
        }

        let control = Arc::new(CleanupControl::new());
        registry.in_flight.insert(target_id.to_string());
        registry
            .cleanup_controls
            .insert(target_id.to_string(), Arc::clone(&control));
        Ok((target, control))
    }

    pub fn cancel_cleanup(target_id: &str) -> NukeResult<CancelCleanupResult> {
        let registry = lock(registry());
        let cancelled = registry
            .cleanup_controls
            .get(target_id)
            .is_some_and(|control| control.request_cancel());
        Ok(CancelCleanupResult { cancelled })
    }

    pub fn finish_cleanup(target_id: &str) {
        let mut registry = lock(registry());
        if let Some(control) = registry.cleanup_controls.get(target_id) {
            control.finish();
        }
        release_claim(&mut registry, target_id);
        registry.targets.remove(target_id);
    }

    pub fn release_cleanup(target_id: &str) {
        let mut registry = lock(registry());
        release_claim(&mut registry, target_id);
    }

    #[cfg(test)]
    pub fn remove_target(target_id: &str) -> NukeResult<RegisteredTarget> {
        let mut registry = lock(registry());
        release_claim(&mut registry, target_id);
        registry
            .targets
            .remove(target_id)
            .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))
    }
}
