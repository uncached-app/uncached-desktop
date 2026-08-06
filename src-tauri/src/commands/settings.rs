use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub default_clean_mode: String,
    pub auto_scan_home: bool,
}

#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, String> {
    Ok(AppSettings {
        default_clean_mode: "Trash".to_string(),
        auto_scan_home: false,
    })
}
