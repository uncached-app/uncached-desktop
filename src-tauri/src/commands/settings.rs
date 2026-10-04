use crate::errors::command::CommandError;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::settings::{
    apply_autostart, keep_backend_stamps, load_settings, persist_settings, AppSettings,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub website: String,
}

/// Whether this launch should stay out of the way.
#[tauri::command]
pub async fn starts_hidden() -> bool {
    crate::tray::starts_hidden()
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<AppSettings, CommandError> {
    load_settings(&app).map_err(settings_unreadable)
}

fn settings_unreadable(detail: String) -> CommandError {
    CommandError::new("settings_unreadable", detail.clone()).with("detail", detail)
}

#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    settings: AppSettings,
) -> Result<AppSettings, CommandError> {
    let mut settings = settings;
    if let Ok(stored) = load_settings(&app) {
        keep_backend_stamps(&mut settings, &stored);
    }
    persist_settings(&app, &settings).map_err(settings_unreadable)?;
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
