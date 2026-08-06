use crate::models::action::{CleanRequest, CleanResult};
use crate::services::clean_service::CleanService;
use crate::services::scan_service::ScanService;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn clean_target(app: AppHandle, request: CleanRequest) -> Result<CleanResult, String> {
    let target_id = request.target_id.clone();
    let mode = request.mode;
    let confirmation = request.confirmation.clone();
    let registered = ScanService::claim_target(&target_id).map_err(|error| error.to_string())?;
    let _ = app.emit(
        "clean:started",
        serde_json::json!({ "targetId": target_id, "mode": mode }),
    );

    let result = tauri::async_runtime::spawn_blocking(move || {
        CleanService::clean_registered_target(registered, mode, confirmation)
    })
    .await
    .map_err(|error| {
        ScanService::release_target(&target_id);
        error.to_string()
    })?;

    match result {
        Ok(clean_result) => {
            let _ = ScanService::remove_target(&target_id);
            let _ = app.emit(
                "clean:success",
                serde_json::json!({ "targetId": target_id, "result": clean_result }),
            );
            Ok(clean_result)
        }
        Err(error) => {
            ScanService::release_target(&target_id);
            let _ = app.emit(
                "clean:failed",
                serde_json::json!({ "targetId": target_id, "message": error.to_string() }),
            );
            Err(error.to_string())
        }
    }
}
