use crate::errors::command::CommandError;
use crate::services::scan_service::{
    target_sized_event, ScanService, ScanStartResult, TargetSizeUpdate,
};
use std::path::PathBuf;
use tauri::AppHandle;

#[tauri::command]
pub async fn start_scan(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<ScanStartResult, CommandError> {
    let roots = paths.into_iter().map(PathBuf::from).collect::<Vec<_>>();
    Ok(ScanService::start_scan(&app, &roots)?)
}

#[tauri::command]
pub async fn retry_target_size(
    target_id: String,
    app: AppHandle,
) -> Result<TargetSizeUpdate, CommandError> {
    let update = tauri::async_runtime::spawn_blocking(move || {
        ScanService::refresh_target_size(&target_id).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError::from(error.to_string()))??;
    use tauri::Emitter;
    let _ = app.emit("scan:target_sized", target_sized_event(&update));
    Ok(update)
}
