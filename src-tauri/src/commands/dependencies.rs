use crate::commands::locate::authorize;
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::AppHandle;
use uncached_core::ProjectDependencies;

/// Declared dependencies nothing in each project names. Read-only: the core
/// reads manifests and sources as text and runs nothing a project ships.
///
/// Every path is authorised against the folders the user chose. A monorepo and
/// one of its members can both be projects in the index, so each manifest is
/// reported once, under the deepest project that holds it.
#[tauri::command]
pub async fn unused_dependencies(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<ProjectDependencies>, String> {
    let mut projects: Vec<PathBuf> = Vec::new();
    for path in &paths {
        projects.push(authorize(&app, path)?);
    }

    tauri::async_runtime::spawn_blocking(move || {
        projects.sort_by_key(|project| std::cmp::Reverse(project.components().count()));
        let mut seen = HashSet::new();
        projects
            .iter()
            .map(|project| {
                let mut found = uncached_core::analyse_project(project);
                found
                    .reports
                    .retain(|report| seen.insert(report.manifest.clone()));
                found
            })
            .filter(|found| !found.reports.is_empty() || !found.unreadable.is_empty())
            .collect()
    })
    .await
    .map_err(|error| error.to_string())
}
