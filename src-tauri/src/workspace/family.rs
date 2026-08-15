//! What belongs together.
//!
//! A workspace is not a flat list of projects and never was. Four folders under
//! one `uncached-app` are one piece of work; the index found four projects and
//! said nothing about the folder holding them, so every screen drew four
//! unrelated things — four rows sorted apart by name, four dots scattered
//! across a map. The relationship was on disk the whole time and nobody read it.
//!
//! Two strengths of belonging, and the difference matters enough to be a field
//! rather than a flag. A **declared** family is one the tooling itself
//! recognises: a `pnpm-workspace.yaml`, a `[workspace]` in a `Cargo.toml`, a
//! `go.work`. Those are facts about how the projects are built. A **folder**
//! family is weaker and honest about it — somebody put these in one directory,
//! which is a decision, but not one any tool enforces.
//!
//! The root itself is never a family. Everything in a chosen folder shares that
//! folder by definition, so calling it a grouping would be calling the workspace
//! a group of one.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Files that mean "the projects under me are one workspace", and the tool that
/// says so. Read in this order, so a repository with several gets the one that
/// governs the most: a `pnpm-workspace.yaml` beside a `Cargo.toml` is a
/// JavaScript monorepo that happens to contain Rust.
const DECLARATIONS: &[(&str, &str)] = &[
    ("pnpm-workspace.yaml", "pnpm"),
    ("pnpm-workspace.yml", "pnpm"),
    ("go.work", "Go"),
    ("lerna.json", "Lerna"),
    ("nx.json", "Nx"),
    ("turbo.json", "Turborepo"),
    ("rush.json", "Rush"),
];

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Family {
    /// The directory holding them, which is also the identity.
    pub path: String,
    pub name: String,
    /// What makes it one: a tool that declares it, or only the folder.
    pub declared_by: Option<String>,
    /// Members, in the order they were discovered.
    pub members: Vec<String>,
}

impl Family {
    /// A declared family is a fact about the build; a folder is a habit.
    pub fn is_declared(&self) -> bool {
        self.declared_by.is_some()
    }
}

/// Groups projects by the directory holding them.
///
/// `has_file` is injected so the rule is testable without a filesystem, the
/// same shape `restore::detect` and `orphans::classify` use.
///
/// A family needs two members. One project in a folder is a project in a
/// folder, and drawing a container around it would be inventing a relationship
/// out of a path separator.
pub fn detect(
    project_paths: &[String],
    roots: &[String],
    has_file: &dyn Fn(&Path, &str) -> bool,
) -> Vec<Family> {
    let root_paths: Vec<PathBuf> = roots.iter().map(PathBuf::from).collect();
    let mut by_parent: HashMap<PathBuf, Vec<String>> = HashMap::new();
    let mut order: Vec<PathBuf> = Vec::new();

    for path in project_paths {
        let Some(parent) = Path::new(path).parent() else {
            continue;
        };
        // The chosen folder is not a grouping. Nor is anything above it: a
        // project cannot be grouped by a directory the user did not index,
        // because the other members of that group were never looked for.
        if root_paths.iter().any(|root| root == parent) {
            continue;
        }
        if !root_paths.iter().any(|root| parent.starts_with(root)) {
            continue;
        }
        let entry = by_parent.entry(parent.to_path_buf()).or_default();
        if entry.is_empty() {
            order.push(parent.to_path_buf());
        }
        entry.push(path.clone());
    }

    order
        .into_iter()
        .filter_map(|parent| {
            let members = by_parent.remove(&parent)?;
            if members.len() < 2 {
                return None;
            }
            Some(Family {
                name: parent
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_else(|| parent.to_string_lossy().into_owned()),
                declared_by: declaration(&parent, has_file),
                path: parent.to_string_lossy().into_owned(),
                members,
            })
        })
        .collect()
}

/// Which tool, if any, calls this directory a workspace.
///
/// `Cargo.toml` is checked apart from the table because the file alone means
/// nothing: a `Cargo.toml` is what every crate has, and only the `[workspace]`
/// section in it says the directories beside it are members. Reading it as a
/// marker by name would make every Rust project's parent a declared monorepo.
fn declaration(directory: &Path, has_file: &dyn Fn(&Path, &str) -> bool) -> Option<String> {
    for (file, tool) in DECLARATIONS {
        if has_file(directory, file) {
            return Some((*tool).to_string());
        }
    }
    None
}

/// Whether a `Cargo.toml` declares a workspace, given its contents.
///
/// Kept separate and taking the text rather than the path: the caller is the
/// one that touches the disk, and this is the part worth pinning down. A
/// `[workspace]` heading counts; the word appearing inside a dependency name or
/// a comment does not.
pub fn cargo_declares_workspace(contents: &str) -> bool {
    contents.lines().any(|line| {
        let line = line.trim();
        line == "[workspace]" || line.starts_with("[workspace.")
    })
}

/// Whether a `package.json` declares workspaces, given its contents.
///
/// npm and Yarn put the list inside the manifest rather than in a file of its
/// own, so there is nothing to find by name — the manifest of a leaf package
/// looks exactly like the manifest of a root until it is read.
pub fn package_declares_workspaces(contents: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(contents) else {
        return false;
    };
    match value.get("workspaces") {
        Some(serde_json::Value::Array(entries)) => !entries.is_empty(),
        Some(serde_json::Value::Object(map)) => map
            .get("packages")
            .and_then(|packages| packages.as_array())
            .is_some_and(|packages| !packages.is_empty()),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nothing(_: &Path, _: &str) -> bool {
        false
    }

    fn only<'a>(files: &'a [&'a str]) -> impl Fn(&Path, &str) -> bool + 'a {
        move |_, name| files.contains(&name)
    }

    #[test]
    fn projects_in_one_folder_are_one_family() {
        let families = detect(
            &[
                "/w/uncached-app/uncached-desktop".into(),
                "/w/uncached-app/uncached-core".into(),
                "/w/uncached-app/uncached-cli".into(),
            ],
            &["/w".into()],
            &nothing,
        );

        assert_eq!(families.len(), 1);
        assert_eq!(families[0].name, "uncached-app");
        assert_eq!(families[0].members.len(), 3);
        assert!(!families[0].is_declared());
    }

    #[test]
    fn a_folder_holding_one_project_is_not_a_family() {
        let families = detect(
            &["/w/solo/api".into(), "/w/other/web".into()],
            &["/w".into()],
            &nothing,
        );

        assert!(families.is_empty(), "one member is a project, not a group");
    }

    #[test]
    fn the_chosen_folder_is_never_a_family() {
        // Everything indexed shares the root by definition, so a root-wide
        // family would be the workspace calling itself a group.
        let families = detect(
            &["/w/api".into(), "/w/web".into(), "/w/admin".into()],
            &["/w".into()],
            &nothing,
        );

        assert!(families.is_empty());
    }

    #[test]
    fn a_declared_workspace_says_which_tool_declared_it() {
        let families = detect(
            &["/w/mono/app".into(), "/w/mono/lib".into()],
            &["/w".into()],
            &only(&["pnpm-workspace.yaml"]),
        );

        assert_eq!(families[0].declared_by.as_deref(), Some("pnpm"));
        assert!(families[0].is_declared());
    }

    #[test]
    fn the_widest_declaration_wins_when_a_directory_has_several() {
        let families = detect(
            &["/w/mono/app".into(), "/w/mono/lib".into()],
            &["/w".into()],
            &only(&["turbo.json", "pnpm-workspace.yaml"]),
        );

        assert_eq!(
            families[0].declared_by.as_deref(),
            Some("pnpm"),
            "a pnpm workspace containing a Turborepo is a pnpm workspace"
        );
    }

    #[test]
    fn a_directory_outside_every_chosen_folder_groups_nothing() {
        // The other members of that group were never looked for, so reporting
        // it as a family would report a count nobody measured.
        let families = detect(
            &["/elsewhere/mono/app".into(), "/elsewhere/mono/lib".into()],
            &["/w".into()],
            &nothing,
        );

        assert!(families.is_empty());
    }

    #[test]
    fn families_keep_the_order_they_were_found_in() {
        let families = detect(
            &[
                "/w/b-group/one".into(),
                "/w/a-group/one".into(),
                "/w/b-group/two".into(),
                "/w/a-group/two".into(),
            ],
            &["/w".into()],
            &nothing,
        );

        assert_eq!(families[0].name, "b-group");
        assert_eq!(families[1].name, "a-group");
    }

    #[test]
    fn a_cargo_manifest_is_a_workspace_only_when_it_says_so() {
        assert!(cargo_declares_workspace("[workspace]\nmembers = [\"a\"]"));
        assert!(cargo_declares_workspace(
            "[workspace.dependencies]\nserde = \"1\""
        ));
        assert!(!cargo_declares_workspace(
            "[package]\nname = \"leaf\"\n\n[dependencies]\nworkspace-hack = \"0.1\""
        ));
        assert!(
            !cargo_declares_workspace("# [workspace] is what you would add here"),
            "a comment is not a declaration"
        );
    }

    #[test]
    fn a_manifest_declares_workspaces_in_either_shape() {
        assert!(package_declares_workspaces(
            r#"{"workspaces":["packages/*"]}"#
        ));
        assert!(package_declares_workspaces(
            r#"{"workspaces":{"packages":["packages/*"]}}"#
        ));
        assert!(!package_declares_workspaces(r#"{"workspaces":[]}"#));
        assert!(!package_declares_workspaces(r#"{"name":"leaf"}"#));
        assert!(!package_declares_workspaces("not json"));
    }
}
