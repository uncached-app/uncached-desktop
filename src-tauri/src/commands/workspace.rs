use serde::Serialize;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::AtomicBool;

const MAX_PROJECTS: usize = 250;
const MAX_DEPTH: usize = 4;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProject {
    pub name: String,
    pub path: String,
    /// The indexed root this project sits under.
    pub root: String,
    pub kind: String,
    pub branch: Option<String>,
    pub last_commit: Option<String>,
    pub dirty: Option<bool>,
}

/// `source_bytes` is what remains once every reclaimable target is removed.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Footprint {
    pub total_bytes: u64,
    pub source_bytes: u64,
    pub reclaimable_bytes: u64,
    /// What the Free plan can act on today.
    pub free_reclaimable_bytes: u64,
    pub by_category: Vec<CategoryBytes>,
    /// Some directory could not be read, so the total is partial.
    pub has_errors: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryBytes {
    pub category: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceIndex {
    pub roots: Vec<String>,
    pub projects: Vec<WorkspaceProject>,
    /// Roots the caller asked for that this plan does not cover.
    pub roots_over_limit: Vec<String>,
    pub root_limit: usize,
    /// Discovery hit `MAX_PROJECTS` or `MAX_DEPTH`.
    pub truncated: bool,
}

/// Canonicalises and collapses roots so the interface lists exactly what will be scanned.
#[tauri::command]
pub async fn normalize_workspace_roots(paths: Vec<String>) -> Vec<String> {
    let canonical = paths
        .into_iter()
        .map(|path| Path::new(&path).canonicalize().unwrap_or(path.into()))
        .collect();
    crate::scanner::outermost_roots(canonical)
        .into_iter()
        .map(|root| root.to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
pub async fn scan_workspace_index(paths: Vec<String>) -> Result<WorkspaceIndex, String> {
    let limit = crate::commands::entitlements::root_limit();
    tauri::async_runtime::spawn_blocking(move || build_index(&paths, limit))
        .await
        .map_err(|error| error.to_string())?
}

fn build_index(paths: &[String], limit: usize) -> Result<WorkspaceIndex, String> {
    if paths.is_empty() {
        return Err("Select at least one folder".to_string());
    }
    let mut canonical = Vec::new();
    for path in paths {
        let root = Path::new(path)
            .canonicalize()
            .map_err(|error| format!("Cannot open workspace: {error}"))?;
        if !root.is_dir() {
            return Err("Workspace path is not a directory".to_string());
        }
        canonical.push(root);
    }
    // Nested roots collapse into the outermost before the plan limit applies,
    // so a redundant folder never costs the user a slot.
    let canonical = crate::scanner::outermost_roots(canonical);
    let (accepted, over_limit) = canonical.split_at(canonical.len().min(limit));

    let mut roots = Vec::new();
    let mut projects = Vec::new();
    let mut truncated = false;

    for root in accepted {
        let before = projects.len();
        discover_projects(root, root, 0, &mut projects)?;
        // The cap is shared across roots, so it is reported once for the whole index.
        truncated = truncated || projects.len() >= MAX_PROJECTS && projects.len() > before;
        roots.push(root.to_string_lossy().into_owned());
    }

    projects.sort_by_cached_key(|project| project.name.to_lowercase());

    Ok(WorkspaceIndex {
        roots,
        projects,
        roots_over_limit: over_limit
            .iter()
            .map(|root| root.to_string_lossy().into_owned())
            .collect(),
        root_limit: limit,
        truncated,
    })
}

fn discover_projects(
    root: &Path,
    directory: &Path,
    depth: usize,
    projects: &mut Vec<WorkspaceProject>,
) -> Result<(), String> {
    if depth > MAX_DEPTH || projects.len() >= MAX_PROJECTS {
        return Ok(());
    }

    let is_project = directory.join(".git").is_dir();
    if is_project {
        projects.push(project_from_directory(directory, root));
        return Ok(());
    }

    let entries = std::fs::read_dir(directory).map_err(|error| error.to_string())?;
    for entry in entries {
        if projects.len() >= MAX_PROJECTS {
            break;
        }
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with('.') || matches!(name, "node_modules" | "target" | "dist" | "build") {
            continue;
        }
        if path != root && looks_like_project(&path) {
            projects.push(project_from_directory(&path, root));
            continue;
        }
        discover_projects(root, &path, depth + 1, projects)?;
    }
    Ok(())
}

fn looks_like_project(directory: &Path) -> bool {
    directory.join(".git").is_dir()
        || [
            "package.json",
            "Cargo.toml",
            "pyproject.toml",
            "go.mod",
            "pom.xml",
        ]
        .iter()
        .any(|file| directory.join(file).is_file())
}

fn project_from_directory(path: &Path, root: &Path) -> WorkspaceProject {
    let (branch, last_commit, dirty) = git_metadata(path);
    WorkspaceProject {
        name: path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Workspace".to_string()),
        path: path.to_string_lossy().into_owned(),
        root: root.to_string_lossy().into_owned(),
        kind: project_kind(path),
        branch,
        last_commit,
        dirty,
    }
}

fn project_kind(path: &Path) -> String {
    if path.join("package.json").is_file() {
        "Node".to_string()
    } else if path.join("Cargo.toml").is_file() {
        "Rust".to_string()
    } else if path.join("pyproject.toml").is_file() {
        "Python".to_string()
    } else if path.join("go.mod").is_file() {
        "Go".to_string()
    } else if path.join("pom.xml").is_file() {
        "Java".to_string()
    } else {
        "Project".to_string()
    }
}

fn git_metadata(path: &Path) -> (Option<String>, Option<String>, Option<bool>) {
    let branch = git_value(path, &["branch", "--show-current"]);
    let last_commit = git_value(path, &["log", "-1", "--format=%h %s"]);
    let dirty = Command::new("git")
        .args(["-C", &path.to_string_lossy(), "status", "--porcelain"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| !output.stdout.is_empty());
    (branch, last_commit, dirty)
}

/// Measures one project. The caller runs these concurrently and stops asking to cancel.
#[tauri::command]
pub async fn measure_project_footprint(
    app: tauri::AppHandle,
    path: String,
) -> Result<Footprint, String> {
    let settings = crate::commands::settings::load_settings(&app).unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || measure_footprint(Path::new(&path), &settings))
        .await
        .map_err(|error| error.to_string())?
}

fn measure_footprint(
    path: &Path,
    settings: &crate::commands::settings::AppSettings,
) -> Result<Footprint, String> {
    let total = crate::filesystem::size::calculate_dir_size_report(path);
    // Same providers and exclusions as the Purge, so reclaimable matches what cleanup takes.
    let providers = crate::scanner::get_default_providers(settings);
    let cancelled = AtomicBool::new(false);

    let mut targets = Vec::new();
    uncached_core::traverse_workspace(path, &providers, &cancelled, |entry| {
        match entry.category.clone() {
            Some(category) => {
                targets.push((entry.path.clone(), category));
                uncached_core::TraversalControl::Prune
            }
            None => uncached_core::TraversalControl::Continue,
        }
    })
    .map_err(|error| error.to_string())?;

    let mut footprint = Footprint {
        total_bytes: total.bytes,
        has_errors: total.errors > 0,
        ..Footprint::default()
    };
    let mut by_category: Vec<(String, u64)> = Vec::new();

    for (target_path, category) in targets {
        let size = crate::filesystem::size::calculate_dir_size_report(&target_path);
        footprint.has_errors = footprint.has_errors || size.errors > 0;
        footprint.reclaimable_bytes = footprint.reclaimable_bytes.saturating_add(size.bytes);
        if crate::commands::entitlements::is_free_category(&category) {
            footprint.free_reclaimable_bytes =
                footprint.free_reclaimable_bytes.saturating_add(size.bytes);
        }
        let wire = category.as_wire();
        match by_category.iter_mut().find(|(name, _)| name == &wire) {
            Some((_, bytes)) => *bytes = bytes.saturating_add(size.bytes),
            None => by_category.push((wire, size.bytes)),
        }
    }

    // Saturating: the two sizing passes disagree if a file vanishes between them.
    footprint.source_bytes = footprint
        .total_bytes
        .saturating_sub(footprint.reclaimable_bytes);
    by_category.sort_by_key(|(_, bytes)| std::cmp::Reverse(*bytes));
    footprint.by_category = by_category
        .into_iter()
        .map(|(category, bytes)| CategoryBytes { category, bytes })
        .collect();

    Ok(footprint)
}

fn git_value(path: &Path, args: &[&str]) -> Option<String> {
    Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::build_index;
    use std::fs;

    #[test]
    fn discovers_project_and_ignores_regenerable_directories() {
        let root = std::env::temp_dir().join(format!("uncached-workspace-{}", std::process::id()));
        let project = root.join("app");
        fs::create_dir_all(project.join(".git")).unwrap();
        fs::create_dir_all(project.join("node_modules")).unwrap();
        fs::create_dir_all(root.join("node_modules").join("nested")).unwrap();
        fs::write(project.join("package.json"), b"{}").unwrap();

        let index = index_of(&[&root]);
        assert_eq!(index.projects.len(), 1);
        assert_eq!(index.projects[0].name, "app");
        assert_eq!(index.projects[0].kind, "Node");

        let _ = fs::remove_dir_all(root);
    }

    fn index_of(roots: &[&std::path::Path]) -> super::WorkspaceIndex {
        let paths = roots
            .iter()
            .map(|root| root.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        build_index(&paths, 12).unwrap()
    }

    fn workspace(name: &str, projects: &[&str]) -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(format!("uncached-roots-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for project in projects {
            fs::create_dir_all(root.join(project).join(".git")).unwrap();
            fs::write(root.join(project).join("package.json"), b"{}").unwrap();
        }
        root
    }

    #[test]
    fn several_roots_index_into_one_list_that_remembers_where_each_came_from() {
        let personal = workspace("personal", &["blog"]);
        let work = workspace("work", &["api"]);

        let index = index_of(&[&personal, &work]);

        assert_eq!(index.roots.len(), 2);
        assert_eq!(index.projects.len(), 2);
        let blog = index
            .projects
            .iter()
            .find(|project| project.name == "blog")
            .expect("the personal project should be indexed");
        assert!(blog.root.ends_with("personal"), "root was {}", blog.root);
        assert!(index.roots_over_limit.is_empty());

        let _ = fs::remove_dir_all(personal);
        let _ = fs::remove_dir_all(work);
    }

    #[test]
    fn a_root_beyond_the_limit_is_named_rather_than_dropped() {
        let personal = workspace("limit-personal", &["blog"]);
        let work = workspace("limit-work", &["api"]);
        let paths = [
            personal.to_string_lossy().into_owned(),
            work.to_string_lossy().into_owned(),
        ];

        let index = build_index(&paths, 1).unwrap();

        assert_eq!(index.roots.len(), 1);
        assert_eq!(index.projects.len(), 1);
        assert_eq!(index.projects[0].name, "blog");
        assert_eq!(
            index.roots_over_limit,
            vec![work.canonicalize().unwrap().to_string_lossy().into_owned()]
        );
        assert_eq!(index.root_limit, 1);

        let _ = fs::remove_dir_all(personal);
        let _ = fs::remove_dir_all(work);
    }

    #[test]
    fn a_footprint_separates_the_work_from_what_can_be_put_back() {
        let root = std::env::temp_dir().join(format!("uncached-footprint-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("package.json"), b"{}").unwrap();
        fs::write(root.join("src/index.js"), vec![b'a'; 100]).unwrap();
        fs::write(root.join("node_modules/pkg/index.js"), vec![b'b'; 900]).unwrap();

        let settings = crate::commands::settings::AppSettings::default();
        let footprint = super::measure_footprint(&root, &settings).unwrap();

        assert!(footprint.reclaimable_bytes >= 900);
        assert_eq!(
            footprint.free_reclaimable_bytes,
            footprint.reclaimable_bytes
        );
        assert_eq!(
            footprint.source_bytes,
            footprint.total_bytes - footprint.reclaimable_bytes
        );
        assert!(footprint.source_bytes < footprint.reclaimable_bytes);
        assert_eq!(footprint.by_category.len(), 1);
        assert_eq!(footprint.by_category[0].category, "NodeModules");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_footprint_does_not_count_what_an_ignore_rule_protects() {
        let root =
            std::env::temp_dir().join(format!("uncached-footprint-ignored-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("package.json"), b"{}").unwrap();
        fs::write(root.join("node_modules/pkg/index.js"), vec![b'b'; 900]).unwrap();

        let settings = crate::commands::settings::AppSettings {
            ignore_rules: root.join("node_modules").to_string_lossy().into_owned(),
            ..crate::commands::settings::AppSettings::default()
        };
        let footprint = super::measure_footprint(&root, &settings).unwrap();

        assert_eq!(footprint.reclaimable_bytes, 0);
        assert!(footprint.by_category.is_empty());
        assert_eq!(footprint.source_bytes, footprint.total_bytes);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_root_nested_in_another_is_replaced_without_duplicating_its_projects() {
        let outer = workspace("nested-outer", &["api"]);
        let inner = outer.join("api");
        let paths = [
            outer.to_string_lossy().into_owned(),
            inner.to_string_lossy().into_owned(),
        ];

        let index = build_index(&paths, 12).unwrap();

        assert_eq!(index.roots.len(), 1);
        assert_eq!(index.projects.len(), 1);
        assert!(index.roots_over_limit.is_empty());

        let _ = fs::remove_dir_all(outer);
    }

    #[test]
    fn indexing_nothing_is_an_error_rather_than_an_empty_map() {
        assert!(build_index(&[], 1).is_err());
    }
}
