use crate::models::action::CleanMode;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub website: String,
}

/// Settings written by an older version are missing whatever was added since,
/// and refusing the whole file over an absent field means a released app stops
/// loading its own settings on upgrade — which is exactly what happened when
/// `keepRunningInBackground` was added.
///
/// `default` at the container level rather than on each field: the per-field
/// form works until someone forgets it once, and that once breaks every
/// existing install. Malformed JSON still fails, so a file that is damaged
/// rather than merely old is not silently replaced by defaults.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub open_at_startup: bool,
    /// Closing the window hides it to the tray instead of quitting.
    pub keep_running_in_background: bool,
    /// Whether the scan looks outside the chosen folders, and at what.
    ///
    /// These are the only detection switches left. Inside a workspace, an
    /// ignore rule already says "never touch anything called this, anywhere",
    /// covers every category rather than five of them, and wins against the
    /// provider, the confidence and a schedule. A toggle beside it would be a
    /// weaker duplicate.
    ///
    /// Outside the workspace there is no equivalent: these caches live under
    /// paths the user never chose, belong to tools rather than to projects, and
    /// each is a different decision — emptying a package manager store slows
    /// every future install, while an editor's index costs a reopen.
    pub detect_package_manager_caches: bool,
    pub detect_ai_tool_caches: bool,
    pub detect_editor_caches: bool,
    pub remember_last_workspace: bool,
    pub check_for_updates: bool,
    pub default_clean_mode: CleanMode,
    /// Paths the user has told us to leave alone, one rule per line, in
    /// `.gitignore` syntax. Stored as the text they typed rather than as
    /// compiled rules: the list is theirs to read and edit, and a line that
    /// fails to compile has to survive a round trip so it can be fixed.
    #[serde(default)]
    pub ignore_rules: String,
    /// Folders the user last chose to scan, so the app opens on them.
    #[serde(default)]
    pub workspace_roots: Vec<String>,
    pub appearance: Appearance,
    #[serde(default)]
    pub last_cleanup: Option<LastCleanup>,
    /// The maintenance policy, which is the only thing on that screen the user
    /// chooses. Stored rather than held in the window because switching module
    /// unmounts the screen, and a threshold that resets when you look away is
    /// not a setting.
    #[serde(default)]
    pub maintenance: crate::workspace::maintenance::MaintenancePolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastCleanup {
    pub removed: u64,
    pub freed_bytes: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Appearance {
    Dark,
    Light,
    System,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            // On by default, and honoured: the plugin registers a login item
            // that launches with `--minimized`, so the app is present without
            // putting a window in front of anyone. A background utility that
            // has to be remembered is a background utility nobody uses.
            open_at_startup: true,
            keep_running_in_background: true,
            detect_package_manager_caches: true,
            detect_ai_tool_caches: true,
            detect_editor_caches: true,
            remember_last_workspace: true,
            check_for_updates: true,
            default_clean_mode: CleanMode::Trash,
            ignore_rules: String::new(),
            workspace_roots: Vec::new(),
            appearance: Appearance::Light,
            last_cleanup: None,
            maintenance: crate::workspace::maintenance::MaintenancePolicy::default(),
        }
    }
}

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

fn persist_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
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

/// Registers or removes the login item to match the stored preference.
///
/// Applied at startup as well as on change: the setting is the source of truth
/// and the operating system is what has to follow it, not the other way round.
/// A failure is logged rather than surfaced — the app works either way, and a
/// dialog about a login item is not worth interrupting a launch for.
pub fn apply_autostart(app: &AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let Ok(settings) = load_settings(app) else {
        return;
    };
    let manager = app.autolaunch();
    let result = if settings.open_at_startup {
        manager.enable()
    } else {
        manager.disable()
    };
    if let Err(error) = result {
        crate::logging::warn(
            "autostart",
            &format!("could not apply the login item error=\"{error}\""),
        );
    }
}

/// Whether this launch should stay out of the way.
#[tauri::command]
pub async fn starts_hidden() -> bool {
    crate::tray::starts_hidden()
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    load_settings(&app)
}

#[tauri::command]
pub async fn update_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    persist_settings(&app, &settings)?;
    // Applied after the write, so the login item follows what was stored rather
    // than what was asked for and might have failed to save.
    apply_autostart(&app);
    Ok(settings)
}

/// One ignore rule that failed to compile, on its way to the screen that
/// accepted it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreRuleProblem {
    pub line: usize,
    pub text: String,
    pub reason: String,
}

/// What the user's rule list currently amounts to.
///
/// The count exists so the interface can say how many rules are in force. A
/// rule that silently removes things from a scan is indistinguishable from a
/// bug three months later, when the report is "the app stopped finding my
/// project".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreRuleReview {
    pub active: usize,
    pub problems: Vec<IgnoreRuleProblem>,
}

#[tauri::command]
pub async fn review_ignore_rules(text: String) -> IgnoreRuleReview {
    let (rules, problems) = crate::scanner::compile_ignore_rules(&text);
    IgnoreRuleReview {
        active: rules.len(),
        problems: problems
            .into_iter()
            .map(|problem| IgnoreRuleProblem {
                line: problem.line,
                text: problem.text,
                reason: problem.reason,
            })
            .collect(),
    }
}

#[tauri::command]
pub async fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Uncached".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        website: "https://uncached.app".to_string(),
    }
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

#[cfg(test)]
mod tests {
    use super::{load_settings_from_path, AppSettings, Appearance};
    use crate::models::action::CleanMode;

    #[test]
    fn defaults_are_safe() {
        let settings = AppSettings::default();
        assert_eq!(settings.default_clean_mode, CleanMode::Trash);
        assert_eq!(settings.appearance, Appearance::Light);
    }

    /// The two background defaults are on, and neither is destructive: one
    /// registers a login item that launches minimized, the other hides the
    /// window instead of quitting. Both are reversible from Settings, and the
    /// tray keeps a way out of both.
    #[test]
    fn the_app_is_present_in_the_background_by_default() {
        let settings = AppSettings::default();
        assert!(settings.open_at_startup);
        assert!(settings.keep_running_in_background);
    }

    #[test]
    fn serializes_settings_with_camel_case() {
        let value = serde_json::to_value(AppSettings::default()).unwrap();
        assert!(value.get("rememberLastWorkspace").is_some());
        assert!(value.get("defaultCleanMode").is_some());
        assert!(value.get("remember_last_workspace").is_none());
    }

    /// The upgrade path, and the regression this class of bug deserves: a file
    /// written before a field existed loads, keeps every value it stored, and
    /// takes the default only for what it predates.
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
        assert!(
            settings.keep_running_in_background,
            "a field the file predates arrives at its default"
        );
        assert_eq!(
            settings.maintenance,
            crate::workspace::maintenance::MaintenancePolicy::default(),
            "and so does a whole block the file predates"
        );
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
}
