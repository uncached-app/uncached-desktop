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
    let path = std::env::temp_dir().join(format!("uncached-history-{}-{name}", std::process::id()));
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
