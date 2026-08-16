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
        // Terminals, the deliberate installs before the one that shipped with
        // the machine. macOS has no default-terminal setting to read, so this
        // order is a guess until the user picks one in Settings.
        ("ghostty", "Ghostty", Terminal, "Ghostty", ANY),
        ("iterm", "iTerm", Terminal, "iTerm", ANY),
        ("iterm2", "iTerm2", Terminal, "iTerm2", ANY),
        ("warp", "Warp", Terminal, "Warp", ANY),
        ("wezterm", "WezTerm", Terminal, "WezTerm", ANY),
        ("kitty", "kitty", Terminal, "kitty", ANY),
        ("alacritty", "Alacritty", Terminal, "Alacritty", ANY),
        ("rio", "Rio", Terminal, "Rio", ANY),
        ("hyper", "Hyper", Terminal, "Hyper", ANY),
        ("tabby", "Tabby", Terminal, "Tabby", ANY),
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
        ("ghostty", "Ghostty", Terminal, "ghostty", ANY),
        ("wezterm", "WezTerm", Terminal, "wezterm", ANY),
        ("alacritty", "Alacritty", Terminal, "alacritty", ANY),
        ("kitty", "kitty", Terminal, "kitty", ANY),
        ("foot", "foot", Terminal, "foot", ANY),
        ("tilix", "Tilix", Terminal, "tilix", ANY),
        ("terminator", "Terminator", Terminal, "terminator", ANY),
        ("xfce4", "Xfce Terminal", Terminal, "xfce4-terminal", ANY),
        ("ptyxis", "Ptyxis", Terminal, "ptyxis", ANY),
        ("gnome", "GNOME Terminal", Terminal, "gnome-terminal", ANY),
        ("konsole", "Konsole", Terminal, "konsole", ANY),
        // Debian's alternatives symlink and the last resort on X11. Neither is
        // anyone's favourite, and without them a machine running neither GNOME
        // nor KDE has no terminal at all.
        (
            "x-terminal",
            "Terminal",
            Terminal,
            "x-terminal-emulator",
            ANY,
        ),
        ("xterm", "xterm", Terminal, "xterm", ANY),
        // Windows without Windows Terminal installed, which is every Windows 10
        // that never opted in. Offering nothing there was the real gap.
        ("pwsh", "PowerShell", Terminal, "pwsh.exe", ANY),
        (
            "powershell",
            "Windows PowerShell",
            Terminal,
            "powershell.exe",
            ANY,
        ),
        ("cmd", "Command Prompt", Terminal, "cmd.exe", ANY),
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
    let launcher = available_launchers()
        .await
        .into_iter()
        .find(|launcher| launcher.program == program)
        .ok_or_else(|| "That application is not installed".to_string())?;

    if launcher.kind == LauncherKind::Terminal {
        return open_terminal_at(&launcher, &target);
    }
    tauri_plugin_opener::open_path(target.to_string_lossy().to_string(), Some(program))
        .map_err(|error| error.to_string())
}

/// Starts a terminal already sitting in the project.
///
/// The opener cannot do this anywhere but macOS, where `open -a Terminal --
/// <path>` means what it looks like. Everywhere else it runs `<app> <path>`,
/// and no terminal emulator reads a bare positional path as a working
/// directory — `gnome-terminal /w/api` opens in your home directory, and
/// `cmd.exe C:\w\api` tries to *execute* the path. On Windows the opener also
/// passes `CREATE_NO_WINDOW`, which is right for an editor and fatal for a
/// console: the process would start with no window at all.
///
/// So each terminal is spawned with its own way of saying "start here", from
/// the table beside its entry.
///
/// **Verified on macOS only.** The flags below are each one's documented
/// option, but this machine cannot run the other two platforms to check them.
fn open_terminal_at(launcher: &Launcher, target: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // `open -a` already starts a terminal in the directory it is handed.
        tauri_plugin_opener::open_path(
            target.to_string_lossy().to_string(),
            Some(launcher.program.clone()),
        )
        .map_err(|error| error.to_string())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let directory = target.to_string_lossy();
        let arguments: Vec<String> = terminal_arguments(&launcher.id)
            .iter()
            .map(|argument| argument.replace("{dir}", &directory))
            .collect();

        let mut command = std::process::Command::new(&launcher.program);
        command.args(&arguments);
        // A terminal with nowhere to start is worse than one starting in the
        // home directory, so a launcher with no known flag is still spawned —
        // it simply opens wherever it defaults to.
        if arguments.is_empty() {
            command.current_dir(target);
        }
        command
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
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
) -> Result<String, String> {
    let target = authorize(&app, &path)?;
    let restore = crate::commands::workspace::restore_for(&target)
        .ok_or_else(|| "Nothing here says how to reinstall".to_string())?;

    let launcher = available_launchers()
        .await
        .into_iter()
        .find(|launcher| launcher.program == program && launcher.kind == LauncherKind::Terminal)
        .ok_or_else(|| "That terminal is not installed".to_string())?;

    let script = write_script(&app, &target, &restore.command)?;
    run_in_terminal(&launcher, &target, &script, &restore.command)?;
    Ok(restore.command)
}

/// Writes the one-shot script the terminal is asked to run.
///
/// A script rather than arguments because every terminal spells "and also run
/// this" differently, and because the shell it starts has to survive the
/// command: `exec $SHELL` at the end leaves the window open on whatever the
/// install printed, which is the only reason a person watches an install at all.
///
/// One fixed name, overwritten each time. A directory that accumulates a script
/// per restore is litter the user never asked for.
fn write_script(app: &AppHandle, target: &Path, command: &str) -> Result<PathBuf, String> {
    use tauri::Manager;

    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Nowhere to write the script".to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    #[cfg(windows)]
    {
        let file = directory.join("uncached-restore.cmd");
        let body = format!(
            "@echo off\r\ncd /d \"{}\"\r\necho {}\r\n{}\r\n",
            target.display(),
            command,
            command
        );
        std::fs::write(&file, body).map_err(|error| error.to_string())?;
        Ok(file)
    }

    #[cfg(not(windows))]
    {
        use std::os::unix::fs::PermissionsExt;

        // `.command` because that is the extension macOS associates with "a
        // script a terminal runs"; harmless everywhere else.
        let file = directory.join("uncached-restore.command");
        let body = format!(
            "#!/bin/sh\ncd {} || exit 1\necho {}\n{}\nexec \"$SHELL\" -l\n",
            quote(&target.to_string_lossy()),
            quote(command),
            command
        );
        std::fs::write(&file, body).map_err(|error| error.to_string())?;
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755))
            .map_err(|error| error.to_string())?;
        Ok(file)
    }
}

/// A string the shell will read as one word, whatever is in it.
#[cfg(not(windows))]
fn quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

/// Starts the terminal on that script.
///
/// **Verified on macOS only**, like the rest of this file — the flags below are
/// each terminal's documented one, and this machine cannot run the other two
/// platforms to check them. A terminal with no known way of being handed a
/// command still opens, in the right directory, doing nothing: the interface
/// leaves the command on the clipboard for exactly that case, so the worst
/// outcome is one paste rather than a dead button.
fn run_in_terminal(
    launcher: &Launcher,
    target: &Path,
    script: &Path,
    command: &str,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // The script already carries both; `open` takes neither.
        let _ = (command, target);
        // `open -a <app> <file>` hands the script to the terminal, which runs
        // it. No Automation permission is involved, unlike the AppleScript
        // route — a prompt the user can refuse is a restore that silently
        // stops working.
        tauri_plugin_opener::open_path(
            script.to_string_lossy().to_string(),
            Some(launcher.program.clone()),
        )
        .map_err(|_| "That terminal would not run the command".to_string())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let directory = target.to_string_lossy();
        let arguments: Vec<String> = terminal_run_arguments(&launcher.id)
            .iter()
            .map(|argument| {
                argument
                    .replace("{dir}", &directory)
                    .replace("{script}", &script.to_string_lossy())
                    .replace("{cmd}", command)
            })
            .collect();

        if arguments.is_empty() {
            // Nothing known about how to hand this one a command, so it gets
            // what it always got: a terminal, in the right place.
            return open_terminal_at(launcher, target);
        }

        std::process::Command::new(&launcher.program)
            .args(&arguments)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

/// How each terminal is told to run something. `{script}` is the file written
/// above, `{cmd}` the command itself for the shells that take no script.
///
/// Empty means this code knows no such option for that terminal, and the caller
/// falls back to opening it in the directory.
#[cfg(not(target_os = "macos"))]
fn terminal_run_arguments(id: &str) -> &'static [&'static str] {
    match id {
        "wt" => &["-d", "{dir}", "cmd.exe", "/K", "{script}"],
        "cmd" => &["/K", "{script}"],
        "powershell" | "pwsh" => &[
            "-NoExit",
            "-Command",
            "Set-Location -LiteralPath '{dir}'; {cmd}",
        ],
        "konsole" => &["--workdir", "{dir}", "-e", "{script}"],
        "kitty" => &["--directory", "{dir}", "{script}"],
        "alacritty" => &["--working-directory", "{dir}", "-e", "{script}"],
        "wezterm" => &["start", "--cwd", "{dir}", "{script}"],
        "gnome" | "ptyxis" => &["--working-directory={dir}", "--", "{script}"],
        "tilix" | "terminator" | "xfce4" | "ghostty" => {
            &["--working-directory={dir}", "-e", "{script}"]
        }
        "foot" => &["--working-directory={dir}", "{script}"],
        "x-terminal" | "xterm" => &["-e", "{script}"],
        _ => &[],
    }
}

/// How each terminal is told where to start. `{dir}` is the project path.
///
/// Empty means the terminal has no such option this code knows, and it is
/// started with its working directory set instead — which most of them inherit.
#[cfg(not(target_os = "macos"))]
fn terminal_arguments(id: &str) -> &'static [&'static str] {
    match id {
        "wt" => &["-d", "{dir}"],
        "cmd" => &["/K", "cd /d {dir}"],
        "powershell" | "pwsh" => &["-NoExit", "-Command", "Set-Location -LiteralPath '{dir}'"],
        "konsole" => &["--workdir", "{dir}"],
        "kitty" => &["--directory", "{dir}"],
        "alacritty" => &["--working-directory", "{dir}"],
        "wezterm" => &["start", "--cwd", "{dir}"],
        "gnome" | "tilix" | "terminator" | "xfce4" | "foot" | "ghostty" | "ptyxis" => {
            &["--working-directory={dir}"]
        }
        _ => &[],
    }
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

    /// Every terminal the table offers on a platform that needs a flag has to
    /// have one, or it opens in the home directory and the verb is a lie.
    /// macOS is exempt: `open -a` already starts one where it is pointed.
    #[cfg(not(target_os = "macos"))]
    #[test]
    fn every_terminal_knows_how_to_be_told_where_to_start() {
        for (id, name, kind, _, _) in super::candidates() {
            if kind != LauncherKind::Terminal {
                continue;
            }
            // `x-terminal-emulator` and `xterm` are the last resorts, and
            // neither has one option that works across what they point at.
            if id == "x-terminal" || id == "xterm" {
                continue;
            }
            assert!(
                !super::terminal_arguments(id).is_empty(),
                "{name} would open wherever it likes"
            );
        }
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
