use serde::Serialize;
use std::path::Path;
use std::process::Command;

const MAX_PROJECTS: usize = 250;
const MAX_DEPTH: usize = 4;

/// How many workspace roots a plan may index at once.
///
/// One root answers "what is in this folder?". Several answer "what is on this
/// machine?", which is the question the module exists for and the one worth
/// paying for. Decided here rather than in the interface for the same reason
/// every other boundary is: a client that asks for five roots on a Free plan
/// gets one, not an apology.
fn root_limit() -> usize {
    if crate::commands::entitlements::current_status().pro_enabled {
        MAX_ROOTS
    } else {
        1
    }
}

const MAX_ROOTS: usize = 12;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProject {
    pub name: String,
    pub path: String,
    /// Which indexed root this project was found under. With several roots the
    /// name alone stops being enough to place a project.
    pub root: String,
    pub kind: String,
    pub branch: Option<String>,
    pub last_commit: Option<String>,
    pub dirty: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceIndex {
    pub roots: Vec<String>,
    pub projects: Vec<WorkspaceProject>,
    /// Roots the caller asked for that this plan does not cover. Named rather
    /// than dropped: silently indexing fewer folders than were selected reads
    /// as the scan being broken.
    pub roots_over_limit: Vec<String>,
    pub root_limit: usize,
    /// Discovery stopped at `MAX_PROJECTS` or `MAX_DEPTH`. A truncated list
    /// that says so is usable; one that does not is misleading.
    pub truncated: bool,
}

#[tauri::command]
pub async fn scan_workspace_index(paths: Vec<String>) -> Result<WorkspaceIndex, String> {
    let limit = root_limit();
    tauri::async_runtime::spawn_blocking(move || build_index(&paths, limit))
        .await
        .map_err(|error| error.to_string())?
}

fn build_index(paths: &[String], limit: usize) -> Result<WorkspaceIndex, String> {
    if paths.is_empty() {
        return Err("Select at least one folder".to_string());
    }
    let (accepted, over_limit) = paths.split_at(paths.len().min(limit));

    let mut roots = Vec::new();
    let mut projects = Vec::new();
    let mut truncated = false;

    for path in accepted {
        let root = Path::new(path)
            .canonicalize()
            .map_err(|error| format!("Cannot open workspace: {error}"))?;
        if !root.is_dir() {
            return Err("Workspace path is not a directory".to_string());
        }
        let before = projects.len();
        discover_projects(&root, &root, 0, &mut projects)?;
        // The cap is shared across roots, so a later root can be cut short by
        // an earlier one. Reporting the cap once, for the whole index, is
        // honest; reporting it per root would suggest each got its own budget.
        truncated = truncated || projects.len() >= MAX_PROJECTS && projects.len() > before;
        roots.push(root.to_string_lossy().into_owned());
    }

    projects.sort_by_cached_key(|project| project.name.to_lowercase());

    Ok(WorkspaceIndex {
        roots,
        projects,
        roots_over_limit: over_limit.to_vec(),
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
        build_index(&paths, super::MAX_ROOTS).unwrap()
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

    /// A plan that covers one root indexes one root - and says which folders it
    /// left out. Dropping them silently would read as the scan being broken,
    /// which is the opposite of the upgrade this limit is meant to suggest.
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
        assert_eq!(index.roots_over_limit, vec![paths[1].clone()]);
        assert_eq!(index.root_limit, 1);

        let _ = fs::remove_dir_all(personal);
        let _ = fs::remove_dir_all(work);
    }

    #[test]
    fn indexing_nothing_is_an_error_rather_than_an_empty_map() {
        assert!(build_index(&[], 1).is_err());
    }
}
