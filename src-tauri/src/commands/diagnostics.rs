use crate::commands::{entitlements, storage};
use crate::settings;
use std::path::Path;
use tauri::AppHandle;

/// Log lines included in a report: enough to cover a scan and a cleanup.
const LOG_LINES: usize = 200;

/// A plain-text report for a support request: version, system, plan, the
/// settings that change what a scan finds, and the end of the log. The home
/// directory is replaced by `~` throughout. Nothing is sent anywhere; the
/// window shows it to be copied.
#[tauri::command]
pub async fn diagnostic_report(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || compose(&app))
        .await
        .map_err(|error| error.to_string())
}

/// Opens the folder holding the log file in the platform's file manager.
#[tauri::command]
pub fn open_log_folder() -> Result<(), String> {
    let log = crate::logging::log_file();
    let target = if log.is_file() {
        log
    } else {
        log.parent().map(Path::to_path_buf).unwrap_or(log)
    };
    tauri_plugin_opener::reveal_item_in_dir(target).map_err(|error| error.to_string())
}

fn compose(app: &AppHandle) -> String {
    let mut lines = vec![
        format!("Uncached {}", app.package_info().version),
        format!("System: {} ({})", system_version(), std::env::consts::ARCH),
        format!("Plan: {:?}", entitlements::current_status().plan),
        format!(
            "Full Disk Access: {}",
            describe_access(storage::full_disk_access())
        ),
    ];
    match settings::load_settings(app) {
        Ok(current) => lines.extend(describe_settings(&current)),
        Err(error) => lines.push(format!("Settings: unreadable ({error})")),
    }
    let log = std::fs::read_to_string(crate::logging::log_file()).unwrap_or_default();
    lines.push(String::new());
    lines.push(format!("Last {LOG_LINES} log lines:"));
    lines.push(tail(&log, LOG_LINES));

    let report = lines.join("\n");
    match uncached_core::home_directory() {
        Some(home) => scrub(&report, &home),
        None => report,
    }
}

fn describe_access(access: Option<bool>) -> &'static str {
    match access {
        Some(true) => "granted",
        Some(false) => "not granted",
        None => "not applicable",
    }
}

fn describe_settings(current: &settings::AppSettings) -> Vec<String> {
    vec![
        format!("Language: {:?}", current.language),
        format!("Clean mode: {:?}", current.default_clean_mode),
        format!("Workspace roots: {}", current.workspace_roots.len()),
        format!(
            "Ignore rules: {}",
            current.ignore_rules.lines().filter(|line| !line.trim().is_empty()).count()
        ),
        format!(
            "Detects: package managers={} ai tools={} editors={} xcode={} game engines={} android={} containers={}",
            current.detect_package_manager_caches,
            current.detect_ai_tool_caches,
            current.detect_editor_caches,
            current.detect_xcode_data,
            current.detect_game_engine_caches,
            current.detect_android_sdk,
            current.detect_container_storage,
        ),
    ]
}

/// The last `count` lines of `text`.
fn tail(text: &str, count: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(count)..].join("\n")
}

/// `home` replaced by `~` wherever it is a whole path prefix, in both
/// separator spellings a Windows path can take. `/Users/ana` does not match
/// inside `/Users/anabel`.
fn scrub(text: &str, home: &Path) -> String {
    let home = home.to_string_lossy();
    if home.len() < 2 {
        return text.to_owned();
    }
    let forward = home.replace('\\', "/");
    replace_prefix(&replace_prefix(text, &home), &forward)
}

fn replace_prefix(text: &str, prefix: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find(prefix) {
        let after = &rest[at + prefix.len()..];
        let whole = after
            .chars()
            .next()
            .is_none_or(|next| !(next.is_alphanumeric() || "_-.".contains(next)));
        out.push_str(&rest[..at]);
        out.push_str(if whole { "~" } else { prefix });
        rest = after;
    }
    out.push_str(rest);
    out
}

#[cfg(target_os = "macos")]
fn system_version() -> String {
    let version = std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|version| version.trim().to_owned())
        .unwrap_or_default();
    format!("macOS {version}")
}

#[cfg(not(target_os = "macos"))]
fn system_version() -> String {
    let release = std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|release| {
            release
                .lines()
                .find_map(|line| line.strip_prefix("PRETTY_NAME="))
                .map(|name| name.trim_matches('"').to_owned())
        });
    release.unwrap_or_else(|| std::env::consts::OS.to_owned())
}

#[cfg(test)]
mod tests {
    use super::{scrub, tail};
    use std::path::Path;

    #[test]
    fn the_home_directory_never_leaves_the_machine_in_a_report() {
        let text = "clean targetPath=\"/Users/ana/work/app/node_modules\"\nroot=/Users/ana";
        assert_eq!(
            scrub(text, Path::new("/Users/ana")),
            "clean targetPath=\"~/work/app/node_modules\"\nroot=~"
        );
        assert_eq!(
            scrub(
                "C:\\Users\\ana\\x and C:/Users/ana/y",
                Path::new("C:\\Users\\ana")
            ),
            "~\\x and ~/y"
        );
        assert_eq!(
            scrub("/Users/anabel/x", Path::new("/Users/ana")),
            "/Users/anabel/x"
        );
    }

    #[test]
    fn a_report_carries_the_end_of_the_log() {
        assert_eq!(tail("a\nb\nc\nd", 2), "c\nd");
        assert_eq!(tail("a\nb", 10), "a\nb");
        assert_eq!(tail("", 10), "");
    }
}
