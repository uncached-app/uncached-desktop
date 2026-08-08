use crate::commands::settings::AppSettings;
use crate::models::action::{CleanRequest, CleanResult};
use crate::services::clean_service::CleanService;
use crate::services::scan_service::ScanService;
use tauri::{AppHandle, Emitter};

fn settings_for_clean<F>(
    mode: crate::models::action::CleanMode,
    load: F,
) -> Result<Option<AppSettings>, String>
where
    F: FnOnce() -> Result<AppSettings, String>,
{
    match mode {
        crate::models::action::CleanMode::Trash => load().map(Some),
        crate::models::action::CleanMode::Permanent => Ok(None),
    }
}

fn should_record_cleanup(mode: crate::models::action::CleanMode) -> bool {
    mode == crate::models::action::CleanMode::Trash
}

#[cfg(test)]
mod tests {
    use super::{settings_for_clean, should_record_cleanup};
    use crate::models::action::CleanMode;

    #[test]
    fn permanent_cleanup_does_not_load_settings() {
        let result =
            settings_for_clean(CleanMode::Permanent, || Err("invalid settings".to_string()));

        assert!(matches!(result, Ok(None)));
    }

    #[test]
    fn trash_cleanup_propagates_settings_error() {
        let result = settings_for_clean(CleanMode::Trash, || Err("invalid settings".to_string()));

        assert_eq!(result.unwrap_err(), "invalid settings");
    }

    #[test]
    fn cleanup_history_is_recorded_only_for_trash() {
        assert!(should_record_cleanup(CleanMode::Trash));
        assert!(!should_record_cleanup(CleanMode::Permanent));
    }
}

#[tauri::command]
pub async fn clean_target(app: AppHandle, request: CleanRequest) -> Result<CleanResult, String> {
    let target_id = request.target_id.clone();
    let mode = request.mode;
    let confirmation = request.confirmation.clone();
    let registered = ScanService::claim_target(&target_id).map_err(|error| error.to_string())?;
    let settings = match settings_for_clean(mode, || crate::commands::settings::load_settings(&app))
    {
        Ok(settings) => settings,
        Err(error) => {
            ScanService::release_target(&target_id);
            return Err(error);
        }
    };
    crate::logging::info(
        "clean",
        &format!("started targetId=\"{}\" mode=\"{:?}\"", target_id, mode),
    );
    let _ = app.emit(
        "clean:started",
        serde_json::json!({ "targetId": target_id, "mode": mode }),
    );

    let result = tauri::async_runtime::spawn_blocking(move || {
        CleanService::clean_registered_target(registered, settings.as_ref(), mode, confirmation)
    })
    .await
    .map_err(|error| {
        ScanService::release_target(&target_id);
        error.to_string()
    })?;

    match result {
        Ok(clean_result) => {
            let _ = ScanService::remove_target(&target_id);
            if should_record_cleanup(mode) {
                if let Err(error) =
                    crate::commands::settings::record_cleanup(&app, clean_result.freed_bytes)
                {
                    crate::logging::warn(
                        "settings",
                        &format!("failed to persist cleanup history error=\"{}\"", error),
                    );
                }
            }
            crate::logging::info(
                "clean",
                &format!(
                    "success targetId=\"{}\" bytes={} sizeHasErrors={}",
                    target_id, clean_result.freed_bytes, clean_result.size_has_errors
                ),
            );
            let _ = app.emit(
                "clean:success",
                serde_json::json!({ "targetId": target_id, "result": clean_result }),
            );
            Ok(clean_result)
        }
        Err(error) => {
            ScanService::release_target(&target_id);
            crate::logging::error(
                "clean",
                &format!("failed targetId=\"{}\" error=\"{}\"", target_id, error),
            );
            let _ = app.emit(
                "clean:failed",
                serde_json::json!({ "targetId": target_id, "message": error.to_string() }),
            );
            Err(error.to_string())
        }
    }
}
