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
//! Paths are the sensitive part of both, and both hold them. The snapshot needs
//! them because a per-project diff has nothing to join on otherwise. The log
//! records one per event because a report you can only read as a single running
//! total is a number, not a report: every question worth asking of a cleanup
//! history — which ecosystem, which workspace, was that me or a schedule — is a
//! dimension that has to have been written down at the time. `clear_history`
//! deletes both files, and nothing here leaves the machine.

use crate::commands::entitlements::current_status;
use crate::models::action::{CleanMode, CleanupTrigger};
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

/// The cleanup log versions separately, and forward rather than sideways.
///
/// Version 1 recorded a timestamp and a byte count. Everything added since is
/// optional on the way in, so those lines still parse and still count towards
/// every total — a history that resets itself when the product learns a new
/// dimension would be a history nobody could trust.
const CLEANUP_SCHEMA_VERSION: u32 = 2;

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
    version: u32,
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

fn totals_from(entries: &[CleanupEvent], now: DateTime<Utc>) -> CleanupTotals {
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
///
/// A line from a *newer* version is skipped for the opposite reason: it was
/// written by a build that knew something this one does not, and reading it
/// half-way is how a total starts lying.
fn read_cleanup_log(path: &Path) -> Vec<CleanupEvent> {
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut events: Vec<CleanupEvent> = contents
        .lines()
        .filter_map(|line| serde_json::from_str::<CleanupEvent>(line).ok())
        .filter(|entry| entry.version >= 1 && entry.version <= CLEANUP_SCHEMA_VERSION)
        .collect();
    // Append order is chronological in practice; sorting makes it so even if a
    // clock moved, because a report draws a timeline out of this.
    events.sort_by_key(|event| event.at);
    events
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

/// Appends one cleanup to the log.
///
/// One line per target, written on the success path only: the history answers
/// what was removed, and a failed attempt removed nothing.
pub fn record_cleanup(app: &AppHandle, record: CleanupRecord<'_>) -> Result<(), String> {
    if !current_status().pro_enabled {
        return Ok(());
    }
    let path = history_dir(app)?.join(CLEANUP_LOG_FILE);
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid history path".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let entry = CleanupEvent {
        version: CLEANUP_SCHEMA_VERSION,
        at: Utc::now(),
        freed_bytes: record.freed_bytes,
        category: Some(record.category.as_wire()),
        path: Some(record.path.to_string_lossy().into_owned()),
        workspace: Some(record.workspace.to_string_lossy().into_owned()),
        mode: Some(record.mode),
        trigger: record.trigger,
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

/// The whole log, plus its summary.
///
/// Returned unaggregated on purpose: filtering a report is an interactive act,
/// and a round trip per filter change would make the screen feel like a query
/// console. The file is one line per cleaned target — a heavy year of use is
/// still measured in hundreds of kilobytes.
#[tauri::command]
pub async fn cleanup_history(app: AppHandle) -> Result<CleanupHistory, String> {
    if !current_status().pro_enabled {
        return Ok(CleanupHistory::default());
    }
    let path = history_dir(&app)?.join(CLEANUP_LOG_FILE);
    let events = read_cleanup_log(&path);
    Ok(CleanupHistory {
        totals: totals_from(&events, Utc::now()),
        events,
    })
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
        compare, read_cleanup_log, read_snapshot, totals_from, write_atomically, CleanupEvent,
        ProjectWeight, WorkspaceSnapshot, CLEANUP_SCHEMA_VERSION, SCHEMA_VERSION,
    };
    use crate::models::action::{CleanMode, CleanupTrigger};
    use chrono::{DateTime, Duration, Utc};

    fn event(at: DateTime<Utc>, freed_bytes: u64) -> CleanupEvent {
        CleanupEvent {
            version: CLEANUP_SCHEMA_VERSION,
            at,
            freed_bytes,
            category: Some("NodeModules".to_owned()),
            path: Some("/w/api/node_modules".to_owned()),
            workspace: Some("/w".to_owned()),
            mode: Some(CleanMode::Trash),
            trigger: CleanupTrigger::Manual,
        }
    }

    fn weight(path: &str, total: u64, reclaimable: u64) -> ProjectWeight {
        ProjectWeight {
            path: path.to_owned(),
            total_bytes: total,
            reclaimable_bytes: reclaimable,
        }
    }

    fn temp_path(name: &str) -> std::path::PathBuf {
        let path =
            std::env::temp_dir().join(format!("uncached-history-{}-{name}", std::process::id()));
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
            &[weight("/w/api", 3_000, 2_000), weight("/w/new", 250, 250)],
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
            event(now - Duration::days(90), 1_000),
            event(now - Duration::days(2), 500),
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
        let good = serde_json::to_string(&event(Utc::now(), 42)).unwrap();
        std::fs::write(&path, format!("{good}\nnot-json\n{good}\n")).unwrap();

        let entries = read_cleanup_log(&path);
        assert_eq!(entries.len(), 2);
        assert_eq!(totals_from(&entries, Utc::now()).all_time_bytes, 84);
        let _ = std::fs::remove_file(path);
    }

    /// The dimensions arrived in version 2. Everything reclaimed before that
    /// still counts, and reads as what it is — recorded, without a category.
    #[test]
    fn a_version_one_line_keeps_its_bytes_and_admits_what_it_does_not_know() {
        let path = temp_path("v1.jsonl");
        let legacy = serde_json::json!({ "version": 1, "at": Utc::now(), "freedBytes": 7 });
        std::fs::write(&path, format!("{legacy}\n")).unwrap();

        let entries = read_cleanup_log(&path);
        assert_eq!(entries.len(), 1, "an older line is history, not corruption");
        assert_eq!(entries[0].freed_bytes, 7);
        assert_eq!(entries[0].category, None);
        assert_eq!(entries[0].trigger, CleanupTrigger::Manual);
        let _ = std::fs::remove_file(path);
    }

    /// Written by a build that knew more than this one does. Counting it would
    /// mean trusting fields we cannot read.
    #[test]
    fn a_line_from_a_future_version_is_left_alone() {
        let path = temp_path("v99.jsonl");
        let ahead = serde_json::json!({
            "version": CLEANUP_SCHEMA_VERSION + 1,
            "at": Utc::now(),
            "freedBytes": 9,
        });
        std::fs::write(&path, format!("{ahead}\n")).unwrap();

        assert!(read_cleanup_log(&path).is_empty());
        let _ = std::fs::remove_file(path);
    }

    /// A report draws a timeline out of this file, and a timeline cannot be
    /// built on the order lines happened to be appended in.
    #[test]
    fn the_log_reads_back_in_time_order() {
        let path = temp_path("order.jsonl");
        let now = Utc::now();
        let lines: Vec<String> = [
            event(now, 3),
            event(now - Duration::days(10), 1),
            event(now - Duration::days(5), 2),
        ]
        .iter()
        .map(|entry| serde_json::to_string(entry).unwrap())
        .collect();
        std::fs::write(&path, format!("{}\n", lines.join("\n"))).unwrap();

        let freed: Vec<u64> = read_cleanup_log(&path)
            .iter()
            .map(|entry| entry.freed_bytes)
            .collect();
        assert_eq!(freed, vec![1, 2, 3]);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn an_event_carries_its_dimensions_across_the_wire_in_camel_case() {
        let value = serde_json::to_value(event(Utc::now(), 5)).unwrap();

        assert_eq!(value["freedBytes"], 5);
        assert_eq!(value["category"], "NodeModules");
        assert_eq!(value["workspace"], "/w");
        assert_eq!(value["mode"], "Trash");
        assert_eq!(value["trigger"], "Manual");
    }

    #[test]
    fn a_missing_log_is_an_empty_history_not_an_error() {
        let totals = totals_from(&read_cleanup_log(&temp_path("absent.jsonl")), Utc::now());
        assert_eq!(totals, super::CleanupTotals::default());
    }
}
