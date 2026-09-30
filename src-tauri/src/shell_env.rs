//! Environment variables the user sets in their shell profile.
//!
//! An app started from Finder or a desktop launcher does not inherit what
//! `.zshrc` exports, so a variable that relocates a tool (`RUSTUP_HOME` on
//! another disk) is invisible to it. This asks the login shell once.

use std::collections::HashMap;
use std::io::Read;
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

/// Variables that move toolchain directories.
pub const TOOLCHAIN_VARIABLES: [&str; 5] = [
    "NVM_DIR",
    "FNM_DIR",
    "RUSTUP_HOME",
    "PYENV_ROOT",
    "SDKMAN_DIR",
];

/// A profile that waits on input or the network must not hold the caller.
const SHELL_TIMEOUT: Duration = Duration::from_secs(3);

const MARKER: &str = "__UNCACHED_ENV__";

static FROM_SHELL: OnceLock<HashMap<String, String>> = OnceLock::new();

/// The value of `name`: this process's environment first, then the login
/// shell's. Empty values count as unset.
pub fn var(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| FROM_SHELL.get_or_init(read_login_shell).get(name).cloned())
}

#[cfg(unix)]
fn read_login_shell() -> HashMap<String, String> {
    let Some(shell) = std::env::var("SHELL")
        .ok()
        .filter(|shell| !shell.is_empty())
    else {
        return HashMap::new();
    };
    let script = format!(
        "printf '{MARKER}'; {}",
        TOOLCHAIN_VARIABLES
            .iter()
            .map(|name| format!("printf '%s=%s\\0' '{name}' \"${name}\""))
            .collect::<Vec<_>>()
            .join("; ")
    );
    let Ok(mut child) = std::process::Command::new(shell)
        .args(["-ilc", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return HashMap::new();
    };

    let deadline = Instant::now() + SHELL_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                crate::logging::warn("shell_env", "login shell did not answer in time");
                return HashMap::new();
            }
        }
    }

    let mut output = String::new();
    if let Some(mut stdout) = child.stdout.take() {
        let _ = stdout.read_to_string(&mut output);
    }
    parse(&output)
}

#[cfg(not(unix))]
fn read_login_shell() -> HashMap<String, String> {
    HashMap::new()
}

/// Reads `NAME=value\0` pairs after the marker; a profile's own output before
/// it is ignored.
fn parse(output: &str) -> HashMap<String, String> {
    let Some((_, pairs)) = output.split_once(MARKER) else {
        return HashMap::new();
    };
    pairs
        .split('\0')
        .filter_map(|pair| pair.split_once('='))
        .filter(|(_, value)| !value.is_empty())
        .map(|(name, value)| (name.to_owned(), value.to_owned()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn profile_noise_before_the_marker_is_ignored() {
        let output = "Welcome back!\n__UNCACHED_ENV__RUSTUP_HOME=/Volumes/SSD/rustup\0NVM_DIR=\0PYENV_ROOT=/opt/pyenv\0";
        let values = parse(output);
        assert_eq!(
            values.get("RUSTUP_HOME").map(String::as_str),
            Some("/Volumes/SSD/rustup")
        );
        assert_eq!(
            values.get("PYENV_ROOT").map(String::as_str),
            Some("/opt/pyenv")
        );
        assert!(!values.contains_key("NVM_DIR"));
    }

    #[test]
    fn output_without_the_marker_yields_nothing() {
        assert!(parse("zsh: command not found").is_empty());
    }
}
