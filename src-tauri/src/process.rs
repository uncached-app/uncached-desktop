//! Starting a program without putting a console window on the user's screen.
//!
//! On Windows, spawning a console application from a GUI process opens a
//! console for it. It appears, flashes, and closes — and this app spawns four
//! Git processes per project while reading a workspace, so scanning twenty
//! projects flashed eighty windows across the screen. The work was correct and
//! it looked like the app was breaking.
//!
//! `CREATE_NO_WINDOW` is the flag that says the child has no console. It is the
//! right default for every program this app runs to read something back.
//!
//! **Not for a terminal.** `commands::locate` starts one deliberately, and a
//! terminal with no window is a process the user cannot see or use — the flag
//! that fixes this bug is the flag that would break that feature, which is why
//! this is a helper to reach for rather than something applied everywhere.

use std::process::Command;

/// `CREATE_NO_WINDOW`, from the Win32 process creation flags.
#[cfg(windows)]
const NO_WINDOW: u32 = 0x0800_0000;

/// A command that will not open a console window of its own.
///
/// Identical to `Command::new` everywhere but Windows, where the flag is the
/// difference between a scan that is invisible and one that strobes.
pub fn quiet(program: &str) -> Command {
    // `mut` is only used on Windows, and the allow is here rather than a second
    // cfg branch: one body that reads the same on every platform is worth more
    // than avoiding one attribute, especially in a function whose Windows half
    // cannot be compiled from a Mac — the Tauri crate pulls in C dependencies
    // that will not cross-build, so a release runner is the first thing to
    // check this.
    #[allow(unused_mut)]
    let mut command = Command::new(program);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(NO_WINDOW);
    }

    command
}
