//! The history commands the window calls. What is recorded, and how, is `crate::history`.

use crate::entitlements::current_status;
use crate::history::{
    compare, history_dir, read_cleanup_log, read_snapshot, totals_from, write_atomically,
    CleanupHistory, ProjectWeight, WorkspaceChange, WorkspaceSnapshot, CLEANUP_LOG_FILE,
    SCHEMA_VERSION, SNAPSHOT_FILE,
};
use chrono::Utc;
use std::fs;
use tauri::AppHandle;

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
