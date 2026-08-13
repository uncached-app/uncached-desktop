use serde::Serialize;
use std::path::Path;
use std::process::Command;

const MAX_PROJECTS: usize = 250;
const MAX_DEPTH: usize = 4;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProject {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub branch: Option<String>,
    pub last_commit: Option<String>,
    pub dirty: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceIndex {
    pub root_path: String,
    pub projects: Vec<WorkspaceProject>,
}

#[tauri::command]
pub async fn scan_workspace_index(path: String) -> Result<WorkspaceIndex, String> {
    tauri::async_runtime::spawn_blocking(move || build_index(Path::new(&path)))
        .await
        .map_err(|error| error.to_string())?
}

fn build_index(root: &Path) -> Result<WorkspaceIndex, String> {
    let root = root
        .canonicalize()
        .map_err(|error| format!("Cannot open workspace: {error}"))?;
    if !root.is_dir() {
        return Err("Workspace path is not a directory".to_string());
    }

    let mut projects = Vec::new();
    discover_projects(&root, &root, 0, &mut projects)?;
    projects.sort_by_cached_key(|project| project.name.to_lowercase());

    Ok(WorkspaceIndex {
        root_path: root.to_string_lossy().into_owned(),
        projects,
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
        projects.push(project_from_directory(directory));
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
            projects.push(project_from_directory(&path));
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

fn project_from_directory(path: &Path) -> WorkspaceProject {
    let (branch, last_commit, dirty) = git_metadata(path);
    WorkspaceProject {
        name: path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Workspace".to_string()),
        path: path.to_string_lossy().into_owned(),
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

        let index = build_index(&root).unwrap();
        assert_eq!(index.projects.len(), 1);
        assert_eq!(index.projects[0].name, "app");
        assert_eq!(index.projects[0].kind, "Node");

        let _ = fs::remove_dir_all(root);
    }
}
