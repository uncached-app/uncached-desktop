use crate::services::scan_service::{ScanService, ScanStartResult, TargetSizeUpdate};
use std::path::PathBuf;
use tauri::AppHandle;

#[tauri::command]
pub async fn start_scan(app: AppHandle, path: String) -> Result<ScanStartResult, String> {
    let root = PathBuf::from(path);
    ScanService::start_scan(&app, &root).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn retry_target_size(
    target_id: String,
    app: AppHandle,
) -> Result<TargetSizeUpdate, String> {
    let update = tauri::async_runtime::spawn_blocking(move || {
        ScanService::refresh_target_size(&target_id).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())??;
    use tauri::Emitter;
    let _ = app.emit("scan:target_sized", update.clone());
    Ok(update)
}
