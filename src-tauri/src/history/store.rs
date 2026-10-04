use super::model::{
    CleanupEvent, CleanupRecord, WorkspaceSnapshot, CLEANUP_LOG_FILE, CLEANUP_SCHEMA_VERSION,
    SCHEMA_VERSION,
};
use crate::entitlements::current_status;
use chrono::{DateTime, Utc};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

pub(crate) fn history_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|error| error.to_string())
}

/// Written to a sibling and renamed, like the settings file: a process that
/// dies mid-write leaves the previous record intact rather than a truncated one.
pub(crate) fn write_atomically(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid history path".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

pub(crate) fn read_snapshot(path: &Path) -> Option<WorkspaceSnapshot> {
    let contents = fs::read_to_string(path).ok()?;
    let snapshot: WorkspaceSnapshot = serde_json::from_str(&contents).ok()?;
    (snapshot.version == SCHEMA_VERSION).then_some(snapshot)
}

/// A malformed line is skipped, not fatal. The log is append-only and written
/// by a process that can be killed; one unreadable line must not cost the user
/// every number that came before it.
///
/// A line from a *newer* version is skipped for the opposite reason: it was
/// written by a build that knew something this one does not, and reading it
/// half-way is how a total starts lying.
pub(crate) fn read_cleanup_log(path: &Path) -> Vec<CleanupEvent> {
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

/// Bytes the log records as freed at or after `since`.
pub fn freed_since(app: &AppHandle, since: DateTime<Utc>) -> u64 {
    let Ok(dir) = history_dir(app) else {
        return 0;
    };
    read_cleanup_log(&dir.join(CLEANUP_LOG_FILE))
        .iter()
        .filter(|entry| entry.at >= since)
        .fold(0u64, |sum, entry| sum.saturating_add(entry.freed_bytes))
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
