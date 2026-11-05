//! Starting a terminal in a directory, or on a one-shot script.

use super::launchers::Launcher;
use crate::errors::command::CommandError;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

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
pub(super) fn open_terminal_at(launcher: &Launcher, target: &Path) -> Result<(), String> {
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

/// Writes the one-shot script the terminal is asked to run.
///
/// A script rather than arguments because every terminal spells "and also run
/// this" differently, and because the shell it starts has to survive the
/// command: `exec $SHELL` at the end leaves the window open on whatever the
/// install printed, which is the only reason a person watches an install at all.
///
/// One fixed name, overwritten each time. A directory that accumulates a script
/// per restore is litter the user never asked for.
pub(super) fn write_script(
    app: &AppHandle,
    target: &Path,
    command: &str,
) -> Result<PathBuf, CommandError> {
    use tauri::Manager;

    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|_| CommandError::new("script_unwritable", "Nowhere to write the script"))?;
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
pub(super) fn run_in_terminal(
    launcher: &Launcher,
    target: &Path,
    script: &Path,
    command: &str,
) -> Result<(), CommandError> {
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
        .map_err(|_| {
            CommandError::new(
                "terminal_refused",
                "That terminal would not run the command",
            )
        })
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
            return Ok(open_terminal_at(launcher, target)?);
        }

        std::process::Command::new(&launcher.program)
            .args(&arguments)
            .spawn()
            .map(|_| ())
            .map_err(|_| {
                CommandError::new(
                    "terminal_refused",
                    "That terminal would not run the command",
                )
            })
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
pub(super) fn terminal_arguments(id: &str) -> &'static [&'static str] {
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
