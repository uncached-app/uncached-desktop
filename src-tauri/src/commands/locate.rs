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
//! Two things are still checked, because "only opens things" is not the same as
//! "harmless". The path has to be inside a folder the user chose, so a bug in
//! the interface cannot ask the system to open somewhere the user never
//! pointed us at. And the program has to be one this machine was found to have
//! — an arbitrary string here would be an arbitrary process, which is a
//! different kind of feature than the one being built.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// An application this machine actually has.
///
/// `program` is what the platform's launcher understands: an application name
/// on macOS, an executable path everywhere else.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Launcher {
    pub id: String,
    pub name: String,
    pub kind: LauncherKind,
    pub program: String,
    /// Project kinds this editor is built for, or empty for a general one.
    ///
    /// Xcode is the reason this exists. Every Mac with developer tools has it,
    /// so on a machine with nothing else installed it was the only editor
    /// offered — for a React project, which is a true answer to "what can open
    /// this" and a useless one. A specialised editor leads only where it is the
    /// specialist, and otherwise sorts below every general-purpose one.
    pub specialises: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LauncherKind {
    Editor,
    Terminal,
}

/// The candidates, in the order they are offered.
///
/// A fixed table rather than a setting, and a detected subset rather than the
/// whole table: asking someone to type the name of their editor is asking them
/// to do the one thing the machine can answer by looking.
#[cfg(target_os = "macos")]
fn candidates() -> Vec<(
    &'static str,
    &'static str,
    LauncherKind,
    &'static str,
    &'static [&'static str],
)> {
    use LauncherKind::{Editor, Terminal};
    const ANY: &[&str] = &[];
    vec![
        // General purpose, in the order someone who installed several would
        // most likely mean. Matching is by prefix, so a build that ships as
        // "… - Insiders" or "… Nightly" is found under the same entry.
        ("vscode", "VS Code", Editor, "Visual Studio Code", ANY),
        ("vscodium", "VSCodium", Editor, "VSCodium", ANY),
        ("cursor", "Cursor", Editor, "Cursor", ANY),
        ("windsurf", "Windsurf", Editor, "Windsurf", ANY),
        ("antigravity", "Antigravity", Editor, "Antigravity IDE", ANY),
        ("trae", "Trae", Editor, "Trae", ANY),
        ("kiro", "Kiro", Editor, "Kiro", ANY),
        ("positron", "Positron", Editor, "Positron", ANY),
        ("zed", "Zed", Editor, "Zed", ANY),
        ("sublime", "Sublime Text", Editor, "Sublime Text", ANY),
        ("nova", "Nova", Editor, "Nova", ANY),
        ("fleet", "Fleet", Editor, "Fleet", ANY),
        ("bbedit", "BBEdit", Editor, "BBEdit", ANY),
        ("textmate", "TextMate", Editor, "TextMate", ANY),
        ("lapce", "Lapce", Editor, "Lapce", ANY),
        ("emacs", "Emacs", Editor, "Emacs", ANY),
        ("macvim", "MacVim", Editor, "MacVim", ANY),
        // Specialists. Each leads only for the language it is built for, and
        // otherwise sorts below every general-purpose editor above.
        ("webstorm", "WebStorm", Editor, "WebStorm", &["Node"]),
        (
            "intellij",
            "IntelliJ IDEA",
            Editor,
            "IntelliJ IDEA",
            &["Java"],
        ),
        (
            "androidstudio",
            "Android Studio",
            Editor,
            "Android Studio",
            &["Java"],
        ),
        ("pycharm", "PyCharm", Editor, "PyCharm", &["Python"]),
        ("rustrover", "RustRover", Editor, "RustRover", &["Rust"]),
        ("goland", "GoLand", Editor, "GoLand", &["Go"]),
        ("clion", "CLion", Editor, "CLion", &["C"]),
        ("phpstorm", "PhpStorm", Editor, "PhpStorm", &["PHP"]),
        ("rubymine", "RubyMine", Editor, "RubyMine", &["Ruby"]),
        ("rider", "Rider", Editor, "Rider", &[".NET"]),
        (
            "visualstudio",
            "Visual Studio",
            Editor,
            "Visual Studio",
            &[".NET"],
        ),
        ("xcode", "Xcode", Editor, "Xcode", &["Swift"]),
        ("ghostty", "Ghostty", Terminal, "Ghostty", ANY),
        ("iterm", "iTerm", Terminal, "iTerm", ANY),
        ("warp", "Warp", Terminal, "Warp", ANY),
        ("wezterm", "WezTerm", Terminal, "WezTerm", ANY),
        ("kitty", "kitty", Terminal, "kitty", ANY),
        ("alacritty", "Alacritty", Terminal, "Alacritty", ANY),
        ("terminal", "Terminal", Terminal, "Terminal", ANY),
    ]
}

#[cfg(not(target_os = "macos"))]
fn candidates() -> Vec<(
    &'static str,
    &'static str,
    LauncherKind,
    &'static str,
    &'static [&'static str],
)> {
    use LauncherKind::{Editor, Terminal};
    const ANY: &[&str] = &[];
    vec![
        ("vscode", "VS Code", Editor, "code", ANY),
        ("vscodium", "VSCodium", Editor, "codium", ANY),
        ("cursor", "Cursor", Editor, "cursor", ANY),
        ("windsurf", "Windsurf", Editor, "windsurf", ANY),
        ("zed", "Zed", Editor, "zed", ANY),
        ("sublime", "Sublime Text", Editor, "subl", ANY),
        ("lapce", "Lapce", Editor, "lapce", ANY),
        ("helix", "Helix", Editor, "hx", ANY),
        ("neovim", "Neovim", Editor, "nvim", ANY),
        ("vim", "Vim", Editor, "vim", ANY),
        ("emacs", "Emacs", Editor, "emacs", ANY),
        ("webstorm", "WebStorm", Editor, "webstorm", &["Node"]),
        ("intellij", "IntelliJ IDEA", Editor, "idea", &["Java"]),
        ("pycharm", "PyCharm", Editor, "pycharm", &["Python"]),
        ("rustrover", "RustRover", Editor, "rustrover", &["Rust"]),
        ("goland", "GoLand", Editor, "goland", &["Go"]),
        ("clion", "CLion", Editor, "clion", &["C"]),
        ("phpstorm", "PhpStorm", Editor, "phpstorm", &["PHP"]),
        ("rubymine", "RubyMine", Editor, "rubymine", &["Ruby"]),
        ("rider", "Rider", Editor, "rider", &[".NET"]),
        ("wt", "Windows Terminal", Terminal, "wt.exe", ANY),
        ("wezterm", "WezTerm", Terminal, "wezterm", ANY),
        ("alacritty", "Alacritty", Terminal, "alacritty", ANY),
        ("kitty", "kitty", Terminal, "kitty", ANY),
        ("gnome", "GNOME Terminal", Terminal, "gnome-terminal", ANY),
        ("konsole", "Konsole", Terminal, "konsole", ANY),
    ]
}

/// Every application bundle this machine has, read once.
///
/// Looked up on disk rather than asked of Launch Services. Every way of asking
/// the launcher goes through `open`, and every one of them can put a window in
/// front of the user as a side effect — an unacceptable price for drawing a
/// menu. The directories below are where applications live; one installed
/// somewhere else is missed, and missing an entry is a far cheaper mistake than
/// opening Finder because a palette was rendered.
#[cfg(target_os = "macos")]
fn installed_apps() -> Vec<String> {
    let mut directories = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/Applications/Utilities"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        directories.push(PathBuf::from(home).join("Applications"));
    }

    let mut names = Vec::new();
    for directory in directories {
        let Ok(entries) = std::fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if let Some(app) = name.strip_suffix(".app") {
                names.push(app.to_owned());
            }
        }
    }
    names.sort();
    names.dedup();
    names
}

/// The installed bundle matching a candidate, by its real name on disk.
///
/// Prefix rather than equality, and the found name is what comes back. Editors
/// ship under names the table cannot enumerate — `IntelliJ IDEA Ultimate`,
/// `Visual Studio Code - Insiders`, `Cursor Nightly`, `PyCharm CE` — and an
/// exact match misses every one of them. It also has to be the discovered name
/// that is handed to `open -a`, because `open -a "IntelliJ IDEA"` fails on a
/// machine that only has the Ultimate bundle.
///
/// The shortest match wins, so a machine with both the stable and the nightly
/// build offers the stable one.
#[cfg(target_os = "macos")]
fn resolve(program: &str, apps: &[String]) -> Option<String> {
    apps.iter()
        .filter(|app| app.as_str() == program || app.starts_with(&format!("{program} ")))
        .min_by_key(|app| app.len())
        .cloned()
}

#[cfg(not(target_os = "macos"))]
fn installed_apps() -> Vec<String> {
    Vec::new()
}

/// On PATH, where a name is a name and there is nothing to disambiguate.
#[cfg(not(target_os = "macos"))]
fn resolve(program: &str, _apps: &[String]) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .any(|directory| {
            let candidate = directory.join(program);
            candidate.is_file() || candidate.with_extension("exe").is_file()
        })
        .then(|| program.to_owned())
}

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
pub(crate) fn authorize(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let requested = std::fs::canonicalize(path).map_err(|_| "That folder is gone".to_string())?;
    if !requested.is_dir() {
        return Err("That is not a folder".to_string());
    }
    let settings = crate::commands::settings::load_settings(app)?;
    let roots: Vec<PathBuf> = settings
        .workspace_roots
        .iter()
        .filter_map(|root| std::fs::canonicalize(root).ok())
        .collect();

    if inside_a_root(&requested, &roots) {
        Ok(requested)
    } else {
        Err("That folder is outside your workspace".to_string())
    }
}

#[tauri::command]
pub async fn reveal_project(app: AppHandle, path: String) -> Result<(), String> {
    let target = authorize(&app, &path)?;
    tauri_plugin_opener::reveal_item_in_dir(target).map_err(|error| error.to_string())
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
) -> Result<(), String> {
    let target = authorize(&app, &path)?;
    let known = available_launchers()
        .await
        .into_iter()
        .any(|launcher| launcher.program == program);
    if !known {
        return Err("That application is not installed".to_string());
    }
    tauri_plugin_opener::open_path(target.to_string_lossy().to_string(), Some(program))
        .map_err(|error| error.to_string())
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
        let candidates = super::candidates();
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
            super::resolve("IntelliJ IDEA", &apps).as_deref(),
            Some("IntelliJ IDEA Ultimate")
        );
        assert_eq!(
            super::resolve("Visual Studio Code", &apps).as_deref(),
            Some("Visual Studio Code - Insiders")
        );
        assert_eq!(
            super::resolve("Cursor", &apps).as_deref(),
            Some("Cursor"),
            "the shortest match wins, so a nightly beside a stable build does not take its place"
        );
        assert_eq!(super::resolve("Zed", &apps), None);
    }

    /// The separator matters. Without it every editor whose name merely starts
    /// the same would claim it — "Code" would match "CodeRunner".
    #[cfg(target_os = "macos")]
    #[test]
    fn a_longer_name_that_merely_starts_the_same_is_a_different_application() {
        let apps = vec!["CodeRunner".to_owned(), "Novaterm".to_owned()];

        assert_eq!(super::resolve("Code", &apps), None);
        assert_eq!(super::resolve("Nova", &apps), None);
    }

    /// A terminal is never specialised, and a general-purpose editor has to
    /// exist on every platform: without one, a machine carrying only Xcode
    /// offers Xcode for a React project — which is where this field came from.
    #[test]
    fn every_platform_offers_an_editor_that_is_not_a_specialist() {
        let candidates = super::candidates();
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
