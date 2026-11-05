//! Reaching a project, from the index.
//!
//! The workspace map knows where every project is; until now it could only say
//! so. These are the three things a developer actually wants to do with a path
//! they are looking at — open it in the editor, open it in a terminal, show it
//! in the file manager — and they are what turns a map into somewhere to work
//! from.
//!
//! Nothing here reads, writes or removes anything. It hands a directory to
//! another program.
//!
//! **Any authorized directory, despite the names.** A project was the first
//! caller and the names kept it, but the check is `path == root ||
//! path.starts_with(root)` — so a workspace root and a folder holding several
//! projects pass it too, which is what the folder menu and the palette's
//! Folders group rely on. Reaching your own workspace directory used to mean
//! leaving for Finder, and the capability had been here the whole time with
//! nothing calling it.
//!
//! Two things are still checked, because "only opens things" is not the same as
//! "harmless". The path has to be inside a folder the user chose, so a bug in
//! the interface cannot ask the system to open somewhere the user never
//! pointed us at. And the program has to be one this machine was found to have
//! — an arbitrary string here would be an arbitrary process, which is a
//! different kind of feature than the one being built.

mod launchers;
mod terminal;

pub use launchers::{Launcher, LauncherKind};

use crate::errors::command::CommandError;
use launchers::{candidates, installed_apps, resolve};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use terminal::{open_terminal_at, run_in_terminal, write_script};

/// Everything on this machine that can open a project directory.
///
/// Probed once and cached for the life of the process: applications do not
/// appear while the window is open often enough to be worth reading four
/// directories on every keystroke of a command palette.
#[tauri::command]
pub async fn available_launchers() -> Vec<Launcher> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<Vec<Launcher>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let apps = installed_apps();
            candidates()
                .into_iter()
                .filter_map(|(id, name, kind, program, specialises)| {
                    let found = resolve(program, &apps)?;
                    Some(Launcher {
                        id: id.to_owned(),
                        name: name.to_owned(),
                        kind,
                        // What was actually found, not what the table guessed.
                        program: found,
                        specialises: specialises.iter().map(|kind| (*kind).to_owned()).collect(),
                    })
                })
                .collect()
        })
        .clone()
}

/// Whether a canonical path sits inside one of the canonical roots.
///
/// Component-wise, which is the whole reason this is not a string prefix test:
/// `/work-archive` starts with `/work` as text and is a different directory.
fn inside_a_root(path: &Path, roots: &[PathBuf]) -> bool {
    roots
        .iter()
        .any(|root| path == root.as_path() || path.starts_with(root))
}

/// Resolves the request against the folders the user chose.
///
/// Canonical on both sides, so a path reaching us through a symlink is judged
/// as where it lands rather than as how it was spelled.
///
/// Shared with the Git commands: every command that takes a path from the
/// interface goes through this one function, so "inside the workspace" has a
/// single definition and a second command cannot quietly get a weaker one.
pub(crate) fn authorize(app: &AppHandle, path: &str) -> Result<PathBuf, CommandError> {
    let requested = dunce::canonicalize(path)
        .map_err(|_| CommandError::new("folder_gone", "That folder is gone"))?;
    if !requested.is_dir() {
        return Err(CommandError::new("not_a_folder", "That is not a folder"));
    }
    let settings = crate::settings::load_settings(app)?;
    let roots: Vec<PathBuf> = settings
        .workspace_roots
        .iter()
        .filter_map(|root| dunce::canonicalize(root).ok())
        .collect();

    if inside_a_root(&requested, &roots) {
        Ok(requested)
    } else {
        Err(CommandError::new(
            "outside_workspace",
            "That folder is outside your workspace",
        ))
    }
}

#[tauri::command]
pub async fn reveal_project(app: AppHandle, path: String) -> Result<(), CommandError> {
    let target = authorize(&app, &path)?;
    tauri_plugin_opener::reveal_item_in_dir(target).map_err(|error| error.to_string().into())
}

/// Opens a project folder with one of the detected applications.
///
/// The program is matched against what detection found rather than passed
/// through. A caller that could name any program could start any process, and
/// this command exists to open an editor.
#[tauri::command]
pub async fn open_project_with(
    app: AppHandle,
    path: String,
    program: String,
) -> Result<(), CommandError> {
    let target = authorize(&app, &path)?;
    let launcher = available_launchers()
        .await
        .into_iter()
        .find(|launcher| launcher.program == program)
        .ok_or_else(|| {
            CommandError::new("app_not_installed", "That application is not installed")
        })?;

    if launcher.kind == LauncherKind::Terminal {
        return Ok(open_terminal_at(&launcher, &target)?);
    }
    tauri_plugin_opener::open_path(target.to_string_lossy().to_string(), Some(program))
        .map_err(|error| error.to_string().into())
}

/// Puts a project back, in the user's own terminal.
///
/// **The command is never taken from the caller.** It is recomputed here from
/// the lockfiles on disk, by the same `restore_for` that fills the field the
/// project page displays. A command parameter would make this "run anything",
/// which is a different and much larger thing than "reinstall this project".
///
/// The app still does not run the package manager itself: it hands the work to
/// a terminal the user already has, in a window they own, where the output is
/// theirs to read and a failure is theirs to see. That was always the point of
/// the rule in `workspace::restore` — not that reinstalling should be laborious.
///
/// Returns the command it started, so the interface can say what is running
/// rather than guess.
#[tauri::command]
pub async fn restore_project(
    app: AppHandle,
    path: String,
    program: String,
) -> Result<String, CommandError> {
    let target = authorize(&app, &path)?;
    let restore = crate::workspace::index::restore_for(&target).ok_or_else(|| {
        CommandError::new("no_restore_recipe", "Nothing here says how to reinstall")
    })?;

    let launcher = available_launchers()
        .await
        .into_iter()
        .find(|launcher| launcher.program == program && launcher.kind == LauncherKind::Terminal)
        .ok_or_else(|| {
            CommandError::new("terminal_not_installed", "That terminal is not installed")
        })?;

    let script = write_script(&app, &target, &restore.command)?;
    run_in_terminal(&launcher, &target, &script, &restore.command)?;
    Ok(restore.command)
}

#[cfg(test)]
mod tests {
    use super::{inside_a_root, LauncherKind};
    use std::path::{Path, PathBuf};

    fn roots(paths: &[&str]) -> Vec<PathBuf> {
        paths.iter().map(PathBuf::from).collect()
    }

    #[test]
    fn a_project_inside_a_chosen_folder_is_reachable() {
        assert!(inside_a_root(Path::new("/work/api"), &roots(&["/work"])));
        assert!(inside_a_root(Path::new("/work"), &roots(&["/work"])));
    }

    /// The reason this is not a string prefix: two different directories share
    /// the spelling, and only one of them was chosen.
    #[test]
    fn a_shared_prefix_is_not_containment() {
        assert!(!inside_a_root(
            Path::new("/work-archive/api"),
            &roots(&["/work"])
        ));
    }

    #[test]
    fn a_path_outside_every_chosen_folder_is_refused() {
        assert!(!inside_a_root(
            Path::new("/etc"),
            &roots(&["/work", "/home/me/code"])
        ));
        assert!(!inside_a_root(Path::new("/work/api"), &roots(&[])));
    }

    /// Each candidate has to be distinguishable in a list the user reads, and
    /// addressable by an id the interface stores.
    #[test]
    fn every_candidate_is_uniquely_identified() {
        let candidates = super::launchers::candidates();
        let mut ids: Vec<&str> = candidates.iter().map(|(id, _, _, _, _)| *id).collect();
        ids.sort_unstable();
        let count = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), count, "two candidates share an id");
        assert!(candidates
            .iter()
            .any(|(_, _, kind, _, _)| *kind == LauncherKind::Terminal));
        assert!(candidates
            .iter()
            .any(|(_, _, kind, _, _)| *kind == LauncherKind::Editor));
    }

    /// Editors ship under names a fixed table cannot enumerate, and an exact
    /// match misses every one of them. The name that comes back is the one on
    /// disk, because `open -a "IntelliJ IDEA"` fails on a machine that only has
    /// the Ultimate bundle.
    #[cfg(target_os = "macos")]
    #[test]
    fn an_editor_is_found_under_whatever_name_it_actually_shipped_with() {
        let apps: Vec<String> = [
            "IntelliJ IDEA Ultimate",
            "Visual Studio Code - Insiders",
            "Cursor",
            "Cursor Nightly",
            "Xcode",
        ]
        .iter()
        .map(|name| (*name).to_owned())
        .collect();

        assert_eq!(
            super::launchers::resolve("IntelliJ IDEA", &apps).as_deref(),
            Some("IntelliJ IDEA Ultimate")
        );
        assert_eq!(
            super::launchers::resolve("Visual Studio Code", &apps).as_deref(),
            Some("Visual Studio Code - Insiders")
        );
        assert_eq!(
            super::launchers::resolve("Cursor", &apps).as_deref(),
            Some("Cursor"),
            "the shortest match wins, so a nightly beside a stable build does not take its place"
        );
        assert_eq!(super::launchers::resolve("Zed", &apps), None);
    }

    /// The separator matters. Without it every editor whose name merely starts
    /// the same would claim it — "Code" would match "CodeRunner".
    #[cfg(target_os = "macos")]
    #[test]
    fn a_longer_name_that_merely_starts_the_same_is_a_different_application() {
        let apps = vec!["CodeRunner".to_owned(), "Novaterm".to_owned()];

        assert_eq!(super::launchers::resolve("Code", &apps), None);
        assert_eq!(super::launchers::resolve("Nova", &apps), None);
    }

    /// Every terminal the table offers on a platform that needs a flag has to
    /// have one, or it opens in the home directory and the verb is a lie.
    /// macOS is exempt: `open -a` already starts one where it is pointed.
    #[cfg(not(target_os = "macos"))]
    #[test]
    fn every_terminal_knows_how_to_be_told_where_to_start() {
        for (id, name, kind, _, _) in super::launchers::candidates() {
            if kind != LauncherKind::Terminal {
                continue;
            }
            // `x-terminal-emulator` and `xterm` are the last resorts, and
            // neither has one option that works across what they point at.
            if id == "x-terminal" || id == "xterm" {
                continue;
            }
            assert!(
                !super::terminal::terminal_arguments(id).is_empty(),
                "{name} would open wherever it likes"
            );
        }
    }

    /// A terminal is never specialised, and a general-purpose editor has to
    /// exist on every platform: without one, a machine carrying only Xcode
    /// offers Xcode for a React project — which is where this field came from.
    #[test]
    fn every_platform_offers_an_editor_that_is_not_a_specialist() {
        let candidates = super::launchers::candidates();
        assert!(candidates
            .iter()
            .any(|(_, _, kind, _, specialises)| *kind == LauncherKind::Editor
                && specialises.is_empty()));
        assert!(
            candidates
                .iter()
                .filter(|(_, _, kind, _, _)| *kind == LauncherKind::Terminal)
                .all(|(_, _, _, _, specialises)| specialises.is_empty()),
            "a terminal opens a directory, so it has no language to specialise in"
        );
    }
}
