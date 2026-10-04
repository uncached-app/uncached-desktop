use super::model::{
    CleanupEvent, CleanupTotals, ProjectWeight, WorkspaceChange, WorkspaceSnapshot,
};
use chrono::{DateTime, Duration, Utc};

/// Compares `projects` against the stored snapshot and returns what moved.
///
/// Joined on path, so a project that was renamed reads as one removed and one
/// added rather than as a size change. That is the honest reading: we have no
/// way to know the two are the same directory.
pub fn compare(previous: &WorkspaceSnapshot, projects: &[ProjectWeight]) -> WorkspaceChange {
    let sum = |weights: &[ProjectWeight]| -> (i64, i64) {
        weights
            .iter()
            .fold((0i64, 0i64), |(total, reclaimable), weight| {
                (
                    total.saturating_add(weight.total_bytes as i64),
                    reclaimable.saturating_add(weight.reclaimable_bytes as i64),
                )
            })
    };
    let (previous_total, previous_reclaimable) = sum(&previous.projects);
    let (current_total, current_reclaimable) = sum(projects);

    let known = |weights: &[ProjectWeight]| {
        weights
            .iter()
            .map(|weight| weight.path.clone())
            .collect::<std::collections::HashSet<_>>()
    };
    let before = known(&previous.projects);
    let after = known(projects);

    WorkspaceChange {
        since: previous.captured_at,
        total_delta: current_total - previous_total,
        reclaimable_delta: current_reclaimable - previous_reclaimable,
        projects_added: after.difference(&before).count(),
        projects_removed: before.difference(&after).count(),
    }
}

pub(crate) fn totals_from(entries: &[CleanupEvent], now: DateTime<Utc>) -> CleanupTotals {
    let cutoff = now - Duration::days(30);
    CleanupTotals {
        all_time_bytes: entries
            .iter()
            .fold(0u64, |sum, entry| sum.saturating_add(entry.freed_bytes)),
        last_30_days_bytes: entries
            .iter()
            .filter(|entry| entry.at >= cutoff)
            .fold(0u64, |sum, entry| sum.saturating_add(entry.freed_bytes)),
        cleanups: entries.len(),
        first_recorded_at: entries.iter().map(|entry| entry.at).min(),
    }
}
