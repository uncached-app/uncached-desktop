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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub open_at_startup: bool,
    pub remember_last_workspace: bool,
    pub check_for_updates: bool,
    pub detect_node_modules: bool,
    pub detect_cargo_target: bool,
    pub detect_gradle_cache: bool,
    pub detect_next_cache: bool,
    pub detect_turbo_cache: bool,
    pub default_clean_mode: CleanMode,
    pub appearance: Appearance,
    #[serde(default)]
    pub last_cleanup: Option<LastCleanup>,
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
            open_at_startup: false,
            remember_last_workspace: true,
            check_for_updates: true,
            detect_node_modules: true,
            detect_cargo_target: true,
            detect_gradle_cache: true,
            detect_next_cache: true,
            detect_turbo_cache: true,
            default_clean_mode: CleanMode::Trash,
            appearance: Appearance::Light,
            last_cleanup: None,
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

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    load_settings(&app)
}

#[tauri::command]
pub async fn update_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    persist_settings(&app, &settings)?;
    Ok(settings)
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
        assert!(!settings.open_at_startup);
    }

    #[test]
    fn serializes_settings_with_camel_case() {
        let value = serde_json::to_value(AppSettings::default()).unwrap();
        assert!(value.get("rememberLastWorkspace").is_some());
        assert!(value.get("defaultCleanMode").is_some());
        assert!(value.get("remember_last_workspace").is_none());
    }

    #[test]
    fn missing_settings_file_uses_defaults() {
        let path = std::env::temp_dir().join(format!(
            "uncached-missing-settings-{}.json",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);

        let settings = load_settings_from_path(&path).unwrap();

        assert!(settings.detect_node_modules);
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
