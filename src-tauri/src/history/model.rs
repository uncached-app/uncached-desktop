use crate::models::action::{CleanMode, CleanupTrigger};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub(crate) const SNAPSHOT_FILE: &str = "workspace-snapshot.json";
pub(crate) const CLEANUP_LOG_FILE: &str = "cleanup-history.jsonl";

/// Bumped when a stored shape stops being readable by this code. A file whose
/// version is not this one is treated as absent rather than migrated in place:
/// the worst case is one visit without a comparison, which is a far better
/// failure than a half-understood record producing a wrong number.
pub(crate) const SCHEMA_VERSION: u32 = 1;

/// The cleanup log versions separately, and forward rather than sideways.
///
/// Version 1 recorded a timestamp and a byte count. Everything added since is
/// optional on the way in, so those lines still parse and still count towards
/// every total — a history that resets itself when the product learns a new
/// dimension would be a history nobody could trust.
pub(crate) const CLEANUP_SCHEMA_VERSION: u32 = 2;

/// What one project weighed when the snapshot was taken.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWeight {
    pub path: String,
    pub total_bytes: u64,
    pub reclaimable_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub version: u32,
    pub captured_at: DateTime<Utc>,
    pub projects: Vec<ProjectWeight>,
}

/// The difference between this visit and the last one.
///
/// Deltas are signed on purpose. A workspace that got smaller is as much a
/// result as one that grew, and reporting only growth would turn the feature
/// into a nagging device.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChange {
    pub since: DateTime<Utc>,
    pub total_delta: i64,
    pub reclaimable_delta: i64,
    pub projects_added: usize,
    pub projects_removed: usize,
}

/// One artifact, removed once.
///
/// The grain is the whole design. Cleanup happens a target at a time, so a
/// target at a time is what actually occurred — and every aggregate the report
/// draws is a sum over these, computed at read time. Storing the aggregates
/// instead would mean deciding today which questions the report is allowed to
/// answer.
///
/// The four dimensions past the timestamp and the size are the ones that cannot
/// be recovered later: what it was, where it was, how it went, and who asked.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CleanupEvent {
    pub(crate) version: u32,
    pub at: DateTime<Utc>,
    pub freed_bytes: u64,
    /// Absent on a version 1 line, and left absent rather than guessed. The
    /// report groups those under "unrecorded", which is the truth about them.
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    /// The scan root the target was found under — the folder the user added,
    /// not the project. It is the one grouping the history can still make sense
    /// of months later, when the project directory may not exist any more.
    #[serde(default)]
    pub workspace: Option<String>,
    #[serde(default)]
    pub mode: Option<CleanMode>,
    #[serde(default)]
    pub trigger: CleanupTrigger,
}

/// What the caller knows at the moment a target comes off the disk.
///
/// Borrowed rather than owned: this is built on the success path of a cleanup,
/// beside the logging, and it must not cost a clone of anything.
pub struct CleanupRecord<'a> {
    pub freed_bytes: u64,
    pub category: &'a crate::models::category::Category,
    pub path: &'a Path,
    pub workspace: &'a Path,
    pub mode: CleanMode,
    pub trigger: CleanupTrigger,
}

/// Everything reclaimed, and how much of it recently.
#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CleanupTotals {
    pub all_time_bytes: u64,
    pub last_30_days_bytes: u64,
    pub cleanups: usize,
    pub first_recorded_at: Option<DateTime<Utc>>,
}

/// The log, and the summary of it, read once.
///
/// One command rather than two because the report and the running total are the
/// same file: asking twice would read it twice and could disagree with itself
/// if a cleanup landed in between.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CleanupHistory {
    pub events: Vec<CleanupEvent>,
    pub totals: CleanupTotals,
}
