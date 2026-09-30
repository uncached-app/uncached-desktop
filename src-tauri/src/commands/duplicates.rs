//! Reading `node_modules` to find the same package installed once per project.
//!
//! Nothing here writes, moves or offers to remove anything. WORKSPACE_REDESIGN
//! section 8 puts a read-only inventory first of four stages for a reason: the
//! sentence "18.2 GB duplicated" is already a product, and every stage after it
//! risks the environment the user works in.
//!
//! Only the top level of each `node_modules` is read. npm and Yarn hoist almost
//! every transitive dependency there, so it is where the duplication actually
//! is, and walking the nested fallback copies would multiply the cost by the
//! depth of the tree to find installs npm chose rather than the user.

use crate::commands::locate::authorize;
use crate::errors::command::CommandError;
use crate::workspace::duplicates::{self, DuplicateReport, Installed};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Enough of a `package.json` to identify what is installed.
#[derive(serde::Deserialize)]
struct Manifest {
    name: Option<String>,
    version: Option<String>,
}

/// Whether this entry is a link, whatever is or is not at the other end.
fn is_link(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .map(|link| link.is_symlink())
        .unwrap_or(false)
}

fn read_manifest(directory: &Path) -> Option<(String, String)> {
    let contents = std::fs::read_to_string(directory.join("package.json")).ok()?;
    let manifest: Manifest = serde_json::from_str(&contents).ok()?;
    Some((manifest.name?, manifest.version?))
}

/// What one project's `node_modules` holds, or nothing at all.
///
/// Returns `None` for a project whose packages are symlinks, which is what pnpm
/// installs: every entry points into one content-addressed store, so the bytes
/// exist once however many projects link to them. Counting those would report
/// duplication that is not there, and report it against the tool that solved it.
fn read_project(project: &Path) -> Option<Vec<Installed>> {
    let modules = project.join("node_modules");
    let entries = std::fs::read_dir(&modules).ok()?;

    let project_path = project.to_string_lossy().into_owned();
    let mut installs = Vec::new();
    let mut linked = 0usize;
    let mut real = 0usize;

    for entry in entries.flatten() {
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        // Asked first, and with `symlink_metadata`: the question is what the
        // entry is, not what it points at. Asked the other way round, a link
        // whose target is gone fails to read and never gets counted as the link
        // it plainly is — which is exactly the state a half-finished pnpm
        // install leaves behind.
        if is_link(&entry.path()) {
            linked += 1;
            continue;
        }
        if !entry.metadata().map(|kind| kind.is_dir()).unwrap_or(false) {
            continue;
        }

        // A scope is a directory of packages, not a package.
        if name.starts_with('@') {
            let Ok(scoped) = std::fs::read_dir(entry.path()) else {
                continue;
            };
            for inner in scoped.flatten() {
                if is_link(&inner.path()) {
                    linked += 1;
                    continue;
                }
                real += 1;
                if let Some((name, version)) = read_manifest(&inner.path()) {
                    installs.push(Installed {
                        name,
                        version,
                        project: project_path.clone(),
                        path: inner.path().to_string_lossy().into_owned(),
                    });
                }
            }
            continue;
        }

        real += 1;
        if let Some((name, version)) = read_manifest(&entry.path()) {
            installs.push(Installed {
                name,
                version,
                project: project_path.clone(),
                path: entry.path().to_string_lossy().into_owned(),
            });
        }
    }

    // A directory of links is a shared store, and this project is not carrying
    // its own copies of anything. Judged by majority rather than by any link at
    // all, because npm leaves a handful of `.bin` links in an ordinary install.
    if linked > real {
        return None;
    }
    Some(installs)
}

/// The same package, installed once per project, across the chosen folders.
///
/// Every path is authorised against the folders the user chose, like every other
/// command that takes one. Read-only on every plan — what Pro adds is elsewhere,
/// and a total the user cannot see is a total nobody wants explained.
#[tauri::command]
pub async fn duplicate_packages(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<DuplicateReport, CommandError> {
    let mut projects: Vec<PathBuf> = Vec::new();
    for path in &paths {
        projects.push(authorize(&app, path)?);
    }

    tauri::async_runtime::spawn_blocking(move || {
        let mut installs = Vec::new();
        let mut scanned = 0usize;
        let mut shared = 0usize;

        for project in &projects {
            match read_project(project) {
                Some(found) => {
                    scanned += 1;
                    installs.extend(found);
                }
                // Either it has no `node_modules` at all, or its packages are
                // links into a store. Only the second is worth reporting, and
                // a project with nothing installed has nothing to say here.
                None if project.join("node_modules").is_dir() => shared += 1,
                None => {}
            }
        }

        let mut report = duplicates::group(installs);
        report.scanned_projects = scanned;
        report.shared_projects = shared;

        // Only the duplicated ones are weighed, and only one copy of each: the
        // rest is arithmetic. Weighing every copy would walk every
        // `node_modules` on the machine to refine a number whose point is the
        // order of magnitude.
        let sizes: HashMap<String, u64> = report
            .packages
            .iter()
            .map(|package| {
                (
                    package.sample_path.clone(),
                    crate::filesystem::size::calculate_dir_size(Path::new(&package.sample_path)),
                )
            })
            .collect();
        duplicates::weigh(&mut report, &sizes);

        report
    })
    .await
    .map_err(|error| error.to_string().into())
}

#[cfg(test)]
mod tests {
    use super::{read_manifest, read_project};
    use std::fs;
    use std::path::{Path, PathBuf};

    fn scratch(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("uncached-dupes-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn package(modules: &Path, name: &str, version: &str) {
        let directory = modules.join(name);
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            directory.join("package.json"),
            format!(r#"{{"name":"{name}","version":"{version}"}}"#),
        )
        .unwrap();
    }

    #[test]
    fn a_manifest_without_a_version_identifies_nothing() {
        let root = scratch("manifest");
        fs::write(root.join("package.json"), r#"{"name":"x"}"#).unwrap();
        assert_eq!(read_manifest(&root), None);

        fs::write(root.join("package.json"), "not json").unwrap();
        assert_eq!(read_manifest(&root), None);

        fs::write(
            root.join("package.json"),
            r#"{"name":"x","version":"1.0.0"}"#,
        )
        .unwrap();
        assert_eq!(
            read_manifest(&root),
            Some(("x".to_owned(), "1.0.0".to_owned()))
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_scope_is_a_directory_of_packages_rather_than_a_package() {
        let root = scratch("scoped");
        let modules = root.join("node_modules");
        package(&modules, "react", "18.3.1");
        package(&modules.join("@types"), "node", "22.0.0");
        fs::create_dir_all(modules.join(".bin")).unwrap();

        let found = read_project(&root).expect("a real install");
        let mut names: Vec<&str> = found.iter().map(|install| install.name.as_str()).collect();
        names.sort();

        assert_eq!(names, vec!["node", "react"]);
        let _ = fs::remove_dir_all(root);
    }

    /// The correctness property the whole feature rests on. pnpm's packages are
    /// links into one store, so the bytes exist once — counting them would
    /// report duplication against the tool that removed it.
    #[cfg(unix)]
    #[test]
    fn a_directory_of_links_is_a_shared_store_and_is_not_counted() {
        let root = scratch("pnpm");
        let store = root.join("store");
        let modules = root.join("node_modules");
        fs::create_dir_all(&modules).unwrap();
        package(&store, "react", "18.3.1");
        package(&store, "vite", "7.0.0");
        std::os::unix::fs::symlink(store.join("react"), modules.join("react")).unwrap();
        std::os::unix::fs::symlink(store.join("vite"), modules.join("vite")).unwrap();

        assert_eq!(
            read_project(&root),
            None,
            "a project that links its packages is not carrying copies of them"
        );
        let _ = fs::remove_dir_all(root);
    }

    /// npm leaves link entries in an ordinary install, and one of them must not
    /// make a real `node_modules` read as a store.
    #[cfg(unix)]
    #[test]
    fn a_handful_of_links_beside_real_packages_is_still_a_real_install() {
        let root = scratch("mixed");
        let modules = root.join("node_modules");
        package(&modules, "react", "18.3.1");
        package(&modules, "vite", "7.0.0");
        package(&modules, "esbuild", "0.28.1");
        std::os::unix::fs::symlink(modules.join("react"), modules.join("linked")).unwrap();

        let found = read_project(&root).expect("three real packages outnumber one link");
        assert_eq!(found.len(), 3);
        let _ = fs::remove_dir_all(root);
    }

    /// A link whose target is gone is still a link. Read the other way round it
    /// fails to open and is silently dropped, which is how a half-finished pnpm
    /// install would read as a project carrying its own copies.
    #[cfg(unix)]
    #[test]
    fn a_link_whose_target_is_gone_still_counts_as_a_link() {
        let root = scratch("broken");
        let modules = root.join("node_modules");
        fs::create_dir_all(&modules).unwrap();
        package(&modules, "real", "1.0.0");
        std::os::unix::fs::symlink(root.join("nowhere"), modules.join("dangling-a")).unwrap();
        std::os::unix::fs::symlink(root.join("nowhere"), modules.join("dangling-b")).unwrap();

        assert_eq!(read_project(&root), None, "two links outnumber one package");
        let _ = fs::remove_dir_all(root);
    }

    /// The whole pipeline over real directories: two projects sharing a version,
    /// one holding its own, and the waste counted once.
    #[test]
    fn two_projects_sharing_a_version_waste_exactly_one_copy_of_it() {
        use crate::workspace::duplicates::{group, weigh};
        use std::collections::HashMap;

        let root = scratch("pipeline");
        for project in ["a", "b"] {
            let modules = root.join(project).join("node_modules");
            package(&modules, "react", "18.3.1");
            fs::write(modules.join("react").join("index.js"), vec![b'x'; 4_096]).unwrap();
        }
        // Same package, different version: two packages, not two copies.
        package(&root.join("c").join("node_modules"), "react", "19.0.0");

        let installs: Vec<_> = ["a", "b", "c"]
            .iter()
            .flat_map(|project| read_project(&root.join(project)).unwrap_or_default())
            .collect();
        let mut report = group(installs);
        let sizes: HashMap<String, u64> = report
            .packages
            .iter()
            .map(|package| {
                (
                    package.sample_path.clone(),
                    crate::filesystem::size::calculate_dir_size(Path::new(&package.sample_path)),
                )
            })
            .collect();
        weigh(&mut report, &sizes);

        assert_eq!(report.packages.len(), 1, "{:?}", report.packages);
        assert_eq!(report.packages[0].version, "18.3.1");
        assert_eq!(report.packages[0].copies, 2);
        assert_eq!(report.distinct_packages, 2, "two versions are two packages");
        assert!(
            report.wasted_bytes >= 4_096,
            "one copy of a 4 KiB package, got {}",
            report.wasted_bytes
        );
        assert_eq!(report.wasted_bytes, report.packages[0].bytes_each.unwrap());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_project_with_nothing_installed_reads_as_nothing_rather_than_as_shared() {
        let root = scratch("empty");
        assert_eq!(read_project(&root), None);
        let _ = fs::remove_dir_all(root);
    }
}
