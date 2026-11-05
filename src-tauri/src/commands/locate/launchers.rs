//! The editors and terminals this machine has, found by looking rather than asked.

use serde::{Deserialize, Serialize};
#[cfg(target_os = "macos")]
use std::path::PathBuf;

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
pub(super) fn candidates() -> Vec<(
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
pub(super) fn candidates() -> Vec<(
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
pub(super) fn installed_apps() -> Vec<String> {
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
pub(super) fn resolve(program: &str, apps: &[String]) -> Option<String> {
    apps.iter()
        .filter(|app| app.as_str() == program || app.starts_with(&format!("{program} ")))
        .min_by_key(|app| app.len())
        .cloned()
}

#[cfg(not(target_os = "macos"))]
pub(super) fn installed_apps() -> Vec<String> {
    Vec::new()
}

/// On PATH, where a name is a name and there is nothing to disambiguate.
#[cfg(not(target_os = "macos"))]
pub(super) fn resolve(program: &str, _apps: &[String]) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .any(|directory| {
            let candidate = directory.join(program);
            candidate.is_file() || candidate.with_extension("exe").is_file()
        })
        .then(|| program.to_owned())
}
