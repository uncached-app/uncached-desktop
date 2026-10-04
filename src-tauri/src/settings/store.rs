//! Reading and writing the settings file, and the stamps the backend keeps in it.

use super::{AppSettings, LastCleanup};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(SETTINGS_FILE))
        .map_err(|error| error.to_string())
}

pub fn load_settings(app: &AppHandle) -> Result<AppSettings, String> {
    load_settings_from_path(&settings_path(app)?)
}

fn load_settings_from_path(path: &std::path::Path) -> Result<AppSettings, String> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(AppSettings::default());
        }
        Err(error) => return Err(error.to_string()),
    };
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

pub(crate) fn persist_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid settings path".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    let contents = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

pub fn record_cleanup(app: &AppHandle, freed_bytes: u64) -> Result<(), String> {
    let mut settings = load_settings(app)?;
    let previous = settings.last_cleanup.unwrap_or(LastCleanup {
        removed: 0,
        freed_bytes: 0,
    });
    settings.last_cleanup = Some(LastCleanup {
        removed: previous.removed + 1,
        freed_bytes: previous.freed_bytes.saturating_add(freed_bytes),
    });
    persist_settings(app, &settings)
}

/// Stamps an unattended attempt, before it does any work rather than after.
///
/// Written first so that a run which crashes the process — or a machine that
/// loses power mid-scan — does not come back and immediately try the same thing
/// again. The cost of stamping early is one skipped interval; the cost of
/// stamping late is a loop.
/// Stamps only the backend writes. The window's copy of them is whatever it
/// loaded, so saving any other setting would put an old stamp back: a
/// maintenance run before its interval, a digest sent twice. Toggling the digest
/// restarts its week.
pub(crate) fn keep_backend_stamps(incoming: &mut AppSettings, stored: &AppSettings) {
    incoming.maintenance_last_run_at = stored.maintenance_last_run_at;
    incoming.weekly_digest_last_at = if incoming.weekly_digest == stored.weekly_digest {
        stored.weekly_digest_last_at
    } else {
        None
    };
}

pub fn record_weekly_digest(app: &AppHandle, at: i64) -> Result<(), String> {
    let mut settings = load_settings(app)?;
    settings.weekly_digest_last_at = Some(at);
    persist_settings(app, &settings)
}

pub fn record_maintenance_run(app: &AppHandle, at: i64) -> Result<(), String> {
    let mut settings = load_settings(app)?;
    settings.maintenance_last_run_at = Some(at);
    persist_settings(app, &settings)
}

#[cfg(test)]
mod tests {
    use super::load_settings_from_path;
    use crate::settings::{AppSettings, Appearance, Language};

    #[test]
    fn settings_from_an_older_version_still_load() {
        let path =
            std::env::temp_dir().join(format!("uncached-upgrade-{}.json", std::process::id()));
        std::fs::write(
            &path,
            br#"{"openAtStartup":false,"rememberLastWorkspace":true,"checkForUpdates":true,
                 "detectNodeModules":false,"detectCargoTarget":true,"detectGradleCache":true,
                 "detectNextCache":true,"detectTurboCache":true,"defaultCleanMode":"Trash",
                 "ignoreRules":"","workspaceRoots":[],"appearance":"dark","lastCleanup":null}"#,
        )
        .unwrap();

        let settings = load_settings_from_path(&path).expect("an older file must still load");
        assert!(
            !settings.open_at_startup,
            "a stored value is never overwritten"
        );
        assert_eq!(settings.appearance, Appearance::Dark);
        assert_eq!(
            settings.language,
            Language::System,
            "a file written before languages existed follows the system"
        );
        assert!(
            settings.keep_running_in_background,
            "a field the file predates arrives at its default"
        );
        assert!(
            !settings.workspace_sidebar_hidden,
            "the filters are there to begin with"
        );
        assert_eq!(
            settings.insights_grain, "month",
            "a defaulted string field takes its default rather than an empty one"
        );
        assert!(
            settings.shortcuts.is_empty(),
            "no overrides, so every key is the one the app shipped with"
        );
        assert_eq!(
            settings.maintenance,
            crate::workspace::maintenance::MaintenancePolicy::default(),
            "and so does a whole block the file predates"
        );
        assert!(
            !settings.maintenance_schedule.enabled,
            "an upgrade never switches on unattended deletion"
        );
        assert_eq!(settings.maintenance_last_run_at, None);
        assert_eq!(
            (settings.preferred_editor, settings.preferred_terminal),
            (None, None),
            "an upgrade inherits automatic, not a choice it never made"
        );
        let _ = std::fs::remove_file(path);
    }

    /// Unknown keys are ignored: `AppSettings` is not `deny_unknown_fields`.
    #[test]
    fn settings_with_a_retired_field_still_load() {
        let path =
            std::env::temp_dir().join(format!("uncached-retired-{}.json", std::process::id()));
        std::fs::write(&path, br#"{"openAtStartup":false,"workspaceView":"map"}"#).unwrap();

        let settings = load_settings_from_path(&path).expect("a retired field must not fail");
        assert!(!settings.open_at_startup);
        let value = serde_json::to_value(&settings).unwrap();
        assert!(value.get("workspaceView").is_none());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn missing_settings_file_uses_defaults() {
        let path = std::env::temp_dir().join(format!(
            "uncached-missing-settings-{}.json",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);

        let settings = load_settings_from_path(&path).unwrap();

        assert!(settings.detect_package_manager_caches);
    }

    #[test]
    fn settings_read_error_does_not_use_defaults() {
        let path = std::env::temp_dir().join(format!(
            "uncached-settings-directory-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();

        let result = load_settings_from_path(&path);

        assert!(result.is_err());
        let _ = std::fs::remove_dir_all(path);
    }

    #[test]
    fn invalid_settings_file_does_not_use_defaults() {
        let path = std::env::temp_dir().join(format!(
            "uncached-invalid-settings-{}.json",
            std::process::id()
        ));
        std::fs::write(&path, b"not-json").unwrap();

        let result = load_settings_from_path(&path);

        assert!(result.is_err());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn saving_from_the_window_keeps_the_stamps_the_backend_wrote() {
        let stored = AppSettings {
            maintenance_last_run_at: Some(2_000),
            weekly_digest: true,
            weekly_digest_last_at: Some(3_000),
            ..AppSettings::default()
        };
        let mut incoming = AppSettings {
            maintenance_last_run_at: Some(1_000),
            weekly_digest: true,
            weekly_digest_last_at: Some(1_000),
            ..AppSettings::default()
        };
        super::keep_backend_stamps(&mut incoming, &stored);
        assert_eq!(incoming.maintenance_last_run_at, Some(2_000));
        assert_eq!(incoming.weekly_digest_last_at, Some(3_000));
    }

    #[test]
    fn toggling_the_digest_restarts_its_week() {
        let stored = AppSettings {
            weekly_digest: false,
            weekly_digest_last_at: Some(3_000),
            ..AppSettings::default()
        };
        let mut incoming = AppSettings {
            weekly_digest: true,
            ..AppSettings::default()
        };
        super::keep_backend_stamps(&mut incoming, &stored);
        assert_eq!(incoming.weekly_digest_last_at, None);
    }
}
