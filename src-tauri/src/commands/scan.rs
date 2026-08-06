use crate::services::scan_service::{ScanService, ScanStartResult};
use std::path::PathBuf;
use tauri::AppHandle;

#[tauri::command]
pub async fn start_scan(app: AppHandle, path: String) -> Result<ScanStartResult, String> {
    let root = PathBuf::from(path);
    ScanService::start_scan(&app, &root).map_err(|error| error.to_string())
}
