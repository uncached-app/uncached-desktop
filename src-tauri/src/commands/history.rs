//! What the machine looked like last time, and what has been reclaimed so far.
//!
//! Every other module here answers a question about the present. This one is
//! the only thing that lets the product say "since your last visit" or "you
//! reclaimed 238 GB", and both sentences are impossible to fake: they need a
//! record that outlives the window.
//!
//! Two files, two shapes, for two different reasons.
//!
//! The snapshot is a single overwritten document — only the last visit can be
//! compared against, so keeping more of them would be storing what nothing
//! reads. The cleanup log is append-only, because a total is the sum of what
//! happened and a rewritten file is a total that can silently drift.
//!
//! Neither file exists on Free. Not as a paywall on a computation, but because
//! persistence is the capability being sold: Free reads the machine fresh every
//! time, which is exactly what it does today, and nothing about the user's
//! filesystem is written down.
//!
//! Paths are the sensitive part of both. The snapshot needs them — a per-project
//! diff has nothing to join on otherwise — and the cleanup log does not, so it
//! never records one. `clear_history` deletes both.

use crate::commands::entitlements::current_status;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const SNAPSHOT_FILE: &str = "workspace-snapshot.json";
const CLEANUP_LOG_FILE: &str = "cleanup-history.jsonl";

/// Bumped when a stored shape stops being readable by this code. A file whose
/// version is not this one is treated as absent rather than migrated in place:
/// the worst case is one visit without a comparison, which is a far better
/// failure than a half-understood record producing a wrong number.
const SCHEMA_VERSION: u32 = 1;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct CleanupEntry {
    version: u32,
    at: DateTime<Utc>,
    freed_bytes: u64,
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

fn history_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|error| error.to_string())
}

/// Written to a sibling and renamed, like the settings file: a process that
/// dies mid-write leaves the previous record intact rather than a truncated one.
fn write_atomically(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid history path".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

fn read_snapshot(path: &Path) -> Option<WorkspaceSnapshot> {
    let contents = fs::read_to_string(path).ok()?;
    let snapshot: WorkspaceSnapshot = serde_json::from_str(&contents).ok()?;
    (snapshot.version == SCHEMA_VERSION).then_some(snapshot)
}

/// Compares `projects` against the stored snapshot and returns what moved.
///
/// Joined on path, so a project that was renamed reads as one removed and one
/// added rather than as a size change. That is the honest reading: we have no
/// way to know the two are the same directory.
pub fn compare(previous: &WorkspaceSnapshot, projects: &[ProjectWeight]) -> WorkspaceChange {
    let sum = |weights: &[ProjectWeight]| -> (i64, i64) {
        weights.iter().fold((0i64, 0i64), |(total, reclaimable), weight| {
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

fn totals_from(entries: &[CleanupEntry], now: DateTime<Utc>) -> CleanupTotals {
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

/// A malformed line is skipped, not fatal. The log is append-only and written
/// by a process that can be killed; one unreadable line must not cost the user
/// every number that came before it.
fn read_cleanup_log(path: &Path) -> Vec<CleanupEntry> {
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };
    contents
        .lines()
        .filter_map(|line| serde_json::from_str::<CleanupEntry>(line).ok())
        .filter(|entry| entry.version == SCHEMA_VERSION)
        .collect()
}

/// Records this visit and returns what changed since the last one.
///
/// Called once per session, when measurement settles. Calling it again would
/// compare the workspace against itself a moment ago, which is true and says
/// nothing.
#[tauri::command]
pub async fn record_workspace_visit(
    app: AppHandle,
    projects: Vec<ProjectWeight>,
) -> Result<Option<WorkspaceChange>, String> {
    if !current_status().pro_enabled {
        return Ok(None);
    }
    let path = history_dir(&app)?.join(SNAPSHOT_FILE);
    let change = read_snapshot(&path).map(|previous| compare(&previous, &projects));

    let snapshot = WorkspaceSnapshot {
        version: SCHEMA_VERSION,
        captured_at: Utc::now(),
        projects,
    };
    let contents = serde_json::to_vec_pretty(&snapshot).map_err(|error| error.to_string())?;
    write_atomically(&path, &contents)?;
    Ok(change)
}

/// Appends one cleanup to the log. Bytes and a timestamp, never a path.
pub fn record_cleanup(app: &AppHandle, freed_bytes: u64) -> Result<(), String> {
    if !current_status().pro_enabled {
        return Ok(());
    }
    let path = history_dir(app)?.join(CLEANUP_LOG_FILE);
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid history path".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let entry = CleanupEntry {
        version: SCHEMA_VERSION,
        at: Utc::now(),
        freed_bytes,
    };
    let mut line = serde_json::to_string(&entry).map_err(|error| error.to_string())?;
    line.push('\n');

    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    file.write_all(line.as_bytes())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn cleanup_totals(app: AppHandle) -> Result<CleanupTotals, String> {
    if !current_status().pro_enabled {
        return Ok(CleanupTotals::default());
    }
    let path = history_dir(&app)?.join(CLEANUP_LOG_FILE);
    Ok(totals_from(&read_cleanup_log(&path), Utc::now()))
}

/// Removes both files. Offered because the snapshot holds paths, and a user who
/// wants that gone should not have to find the directory themselves.
#[tauri::command]
pub async fn clear_history(app: AppHandle) -> Result<(), String> {
    let directory = history_dir(&app)?;
    for file in [SNAPSHOT_FILE, CLEANUP_LOG_FILE] {
        match fs::remove_file(directory.join(file)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        compare, read_cleanup_log, read_snapshot, totals_from, write_atomically, CleanupEntry,
        ProjectWeight, WorkspaceSnapshot, SCHEMA_VERSION,
    };
    use chrono::{Duration, Utc};

    fn weight(path: &str, total: u64, reclaimable: u64) -> ProjectWeight {
        ProjectWeight {
            path: path.to_owned(),
            total_bytes: total,
            reclaimable_bytes: reclaimable,
        }
    }

    fn temp_path(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "uncached-history-{}-{name}",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);
        path
    }

    #[test]
    fn a_workspace_that_grew_reports_the_growth_and_the_new_projects() {
        let previous = WorkspaceSnapshot {
            version: SCHEMA_VERSION,
            captured_at: Utc::now() - Duration::days(7),
            projects: vec![weight("/w/api", 1_000, 400), weight("/w/old", 500, 100)],
        };
        let change = compare(
            &previous,
            &[
                weight("/w/api", 3_000, 2_000),
                weight("/w/new", 250, 250),
            ],
        );

        assert_eq!(change.total_delta, 1_750);
        assert_eq!(change.reclaimable_delta, 1_750);
        assert_eq!(change.projects_added, 1);
        assert_eq!(change.projects_removed, 1);
    }

    /// A cleanup between visits makes the delta negative, and that has to
    /// survive: reporting only growth would make the product a nagging device.
    #[test]
    fn a_workspace_that_shrank_reports_a_negative_delta() {
        let previous = WorkspaceSnapshot {
            version: SCHEMA_VERSION,
            captured_at: Utc::now() - Duration::days(1),
            projects: vec![weight("/w/api", 9_000, 8_000)],
        };
        let change = compare(&previous, &[weight("/w/api", 1_000, 0)]);

        assert_eq!(change.total_delta, -8_000);
        assert_eq!(change.reclaimable_delta, -8_000);
        assert_eq!(change.projects_added, 0);
        assert_eq!(change.projects_removed, 0);
    }

    /// A renamed directory is two events, not a resize. We cannot know the two
    /// paths are the same project, and guessing would invent a number.
    #[test]
    fn a_renamed_project_reads_as_one_removed_and_one_added() {
        let previous = WorkspaceSnapshot {
            version: SCHEMA_VERSION,
            captured_at: Utc::now(),
            projects: vec![weight("/w/before", 100, 100)],
        };
        let change = compare(&previous, &[weight("/w/after", 100, 100)]);

        assert_eq!(change.total_delta, 0);
        assert_eq!(change.projects_added, 1);
        assert_eq!(change.projects_removed, 1);
    }

    #[test]
    fn a_snapshot_from_another_schema_is_treated_as_absent() {
        let path = temp_path("schema.json");
        let stored = serde_json::json!({
            "version": SCHEMA_VERSION + 1,
            "capturedAt": Utc::now(),
            "projects": [],
        });
        write_atomically(&path, stored.to_string().as_bytes()).unwrap();

        assert!(
            read_snapshot(&path).is_none(),
            "an unreadable record must cost one comparison, never a wrong number"
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn totals_separate_the_last_thirty_days_from_everything() {
        let now = Utc::now();
        let entries = vec![
            CleanupEntry {
                version: SCHEMA_VERSION,
                at: now - Duration::days(90),
                freed_bytes: 1_000,
            },
            CleanupEntry {
                version: SCHEMA_VERSION,
                at: now - Duration::days(2),
                freed_bytes: 500,
            },
        ];
        let totals = totals_from(&entries, now);

        assert_eq!(totals.all_time_bytes, 1_500);
        assert_eq!(totals.last_30_days_bytes, 500);
        assert_eq!(totals.cleanups, 2);
        assert_eq!(totals.first_recorded_at, Some(now - Duration::days(90)));
    }

    #[test]
    fn a_corrupt_line_costs_only_itself() {
        let path = temp_path("log.jsonl");
        let good = serde_json::to_string(&CleanupEntry {
            version: SCHEMA_VERSION,
            at: Utc::now(),
            freed_bytes: 42,
        })
        .unwrap();
        std::fs::write(&path, format!("{good}\nnot-json\n{good}\n")).unwrap();

        let entries = read_cleanup_log(&path);
        assert_eq!(entries.len(), 2);
        assert_eq!(totals_from(&entries, Utc::now()).all_time_bytes, 84);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn a_missing_log_is_an_empty_history_not_an_error() {
        let totals = totals_from(&read_cleanup_log(&temp_path("absent.jsonl")), Utc::now());
        assert_eq!(totals, super::CleanupTotals::default());
    }
}
