//! Walking the chosen folders for regenerable directories nothing owns.
//!
//! A separate walk rather than a pass over the index, because the index cannot
//! reach these: `discover_projects` skips `node_modules` and the dot-caches by
//! name before it looks inside, and it only records a directory at all once a
//! project marker confirms it. An orphan is defined by the absence of that
//! marker, so the one walk that could see it is one that goes looking.
//!
//! Read-only, and the module doc on `workspace::orphans` says why that is not a
//! staging decision: cleanup validates against the providers, and the providers
//! refuse a directory no manifest confirms.

use crate::commands::locate::authorize;
use crate::workspace::orphans::{self, Orphan, OrphanReport};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Deep enough to cross a folder of folders of repositories, and no deeper. The
/// same ceiling the workspace index walks to, for the same reason: past it, the
/// walk costs more than the finding is worth.
const MAX_DEPTH: usize = 5;

/// A backstop against a pathological tree, not an expected limit.
const MAX_FINDINGS: usize = 500;

fn has_marker(directory: &Path, marker: &str) -> bool {
    directory.join(marker).is_file()
}

/// Collects orphans under one root.
///
/// Never descends into a directory it has just reported, and never into one it
/// recognised and dismissed: whatever is inside a `node_modules` belongs to
/// that install either way, and walking it is the expensive mistake here.
fn walk(
    root: &Path,
    directory: &Path,
    depth: usize,
    found: &mut Vec<Orphan>,
    examined: &mut usize,
) {
    if depth > MAX_DEPTH || found.len() >= MAX_FINDINGS {
        return;
    }
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        if found.len() >= MAX_FINDINGS {
            return;
        }
        let path = entry.path();
        // `file_type` rather than `metadata`: a symlinked directory must not be
        // followed, or a link pointing outward turns a bounded walk into the
        // whole disk, and reports paths outside the folder the user chose.
        if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            continue;
        }
        *examined += 1;

        match orphans::classify(&path, root, &has_marker) {
            Some(orphan) => {
                found.push(orphan);
                // Reported. Its contents are its own.
            }
            None if is_claimed_artifact(&path) => {
                // Recognised and owned. Nothing inside is a finding either.
            }
            None => walk(root, &path, depth + 1, found, examined),
        }
    }
}

/// Whether this is one of the names the rule knows, in the case where a project
/// does claim it.
///
/// `classify` returns `None` both for "owned" and for "not a name we know", and
/// only the first is a reason to stop descending. Without the difference, the
/// walk would either recurse into every `node_modules` on the machine or stop
/// at every ordinary folder.
fn is_claimed_artifact(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            matches!(
                name,
                "node_modules" | ".next" | ".turbo" | ".angular" | ".nuxt" | ".svelte-kit"
            )
        })
        .unwrap_or(false)
}

/// Regenerable directories under the chosen folders that no project claims.
///
/// Free on every plan. It reports what cannot be acted on from inside the app,
/// and a finding the product will not act on is not a capability to sell.
#[tauri::command]
pub async fn orphan_artifacts(app: AppHandle, paths: Vec<String>) -> Result<OrphanReport, String> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for path in &paths {
        roots.push(authorize(&app, path)?);
    }

    tauri::async_runtime::spawn_blocking(move || {
        let mut found = Vec::new();
        let mut examined = 0usize;
        for root in &roots {
            walk(root, root, 0, &mut found, &mut examined);
        }

        let sizes: HashMap<String, u64> = found
            .iter()
            .map(|orphan| {
                (
                    orphan.path.clone(),
                    crate::filesystem::size::calculate_dir_size(Path::new(&orphan.path)),
                )
            })
            .collect();

        let mut report = OrphanReport {
            orphans: found,
            examined,
            bytes: 0,
        };
        orphans::weigh(&mut report, &sizes);
        report
    })
    .await
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::walk;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn scratch(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("uncached-orphans-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn project(root: &Path, name: &str, with_manifest: bool) {
        let directory = root.join(name);
        fs::create_dir_all(directory.join("node_modules").join("react")).unwrap();
        if with_manifest {
            fs::write(directory.join("package.json"), r#"{"name":"x"}"#).unwrap();
        }
    }

    #[test]
    fn only_the_install_whose_project_is_gone_is_reported() {
        let root = scratch("mixed");
        project(&root, "alive", true);
        project(&root, "abandoned", false);

        let mut found = Vec::new();
        let mut examined = 0;
        walk(&root, &root, 0, &mut found, &mut examined);

        assert_eq!(found.len(), 1, "{found:?}");
        assert!(found[0].path.contains("abandoned"));
        assert!(examined > 0, "the walk reports that it looked");
        let _ = fs::remove_dir_all(root);
    }

    /// The expensive mistake. Inside a reported `node_modules` are hundreds of
    /// package directories, and one of them holding its own nested install must
    /// not become a second finding — nor must the walk descend there at all.
    #[test]
    fn the_walk_does_not_go_inside_what_it_reported() {
        let root = scratch("nested");
        let abandoned = root.join("abandoned");
        fs::create_dir_all(abandoned.join("node_modules/debug/node_modules/ms")).unwrap();

        let mut found = Vec::new();
        let mut examined = 0;
        walk(&root, &root, 0, &mut found, &mut examined);

        assert_eq!(found.len(), 1, "one finding, not one per nesting level");
        assert!(found[0].path.ends_with("abandoned/node_modules"));
        let _ = fs::remove_dir_all(root);
    }

    /// A claimed install is dismissed rather than walked. Descending into it
    /// would cost the whole dependency tree of every healthy project to find
    /// nothing, which is most of the machine.
    #[test]
    fn a_healthy_project_is_not_walked_into() {
        let root = scratch("healthy");
        project(&root, "alive", true);
        fs::create_dir_all(root.join("alive/node_modules/pkg/deep/deeper")).unwrap();

        let mut found = Vec::new();
        let mut examined = 0;
        walk(&root, &root, 0, &mut found, &mut examined);

        assert!(found.is_empty());
        assert!(
            examined <= 3,
            "the walk stopped at the install rather than reading it, saw {examined}"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_directory_is_never_followed() {
        let root = scratch("links");
        let outside = root.join("outside");
        fs::create_dir_all(outside.join("node_modules")).unwrap();
        let inside = root.join("inside");
        fs::create_dir_all(&inside).unwrap();
        std::os::unix::fs::symlink(&outside, inside.join("link")).unwrap();

        let mut found = Vec::new();
        let mut examined = 0;
        walk(&inside, &inside, 0, &mut found, &mut examined);

        assert!(
            found.is_empty(),
            "a link out of the chosen folder is not a finding inside it: {found:?}"
        );
        let _ = fs::remove_dir_all(root);
    }
}
