use crate::commands::settings::AppSettings;
use crate::models::action::{CleanRequest, CleanResult};
use crate::services::clean_service::CleanService;
use crate::services::scan_service::ScanService;
use tauri::{AppHandle, Emitter};

fn clean_event_for_result(
    target_id: &str,
    result: &crate::errors::NukeResult<CleanResult>,
) -> (&'static str, serde_json::Value) {
    match result {
        Ok(clean_result) => (
            "clean:success",
            serde_json::json!({ "targetId": target_id, "result": clean_result }),
        ),
        Err(error) => (
            "clean:failed",
            serde_json::json!({
                "targetId": target_id,
                "message": error.to_string(),
                "cancelled": matches!(error, crate::errors::NukeError::CleanupCancelled),
            }),
        ),
    }
}

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
    use super::{clean_event_for_result, settings_for_clean, should_record_cleanup};
    use crate::commands::settings::AppSettings;
    use crate::errors::NukeError;
    use crate::models::action::CleanMode;
    use crate::models::category::Category;
    use crate::models::target::ScanTarget;
    use crate::services::clean_service::CleanService;
    use crate::services::scan_service::{CleanupControl, RegisteredTarget};
    use serde_json::json;
    use std::path::PathBuf;
    use std::sync::Arc;

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

    #[test]
    fn cancellation_emits_failed_event_without_success_event() {
        let target_id = "target-1";
        let control = Arc::new(CleanupControl::new());
        assert!(control.request_cancel());
        let settings = AppSettings::default();
        let result = CleanService::clean_registered_target(
            RegisteredTarget {
                target: ScanTarget::new(
                    PathBuf::from(r"C:\workspace\node_modules"),
                    Category::NodeModules,
                    1,
                    false,
                    None,
                ),
                root_path: PathBuf::from(r"C:\workspace"),
                providers: Arc::new(crate::scanner::get_default_providers(&settings)),
            },
            control,
            Some(&settings),
            CleanMode::Trash,
            None,
        );

        assert!(matches!(result, Err(NukeError::CleanupCancelled)));
        let (event, payload) = clean_event_for_result(target_id, &result);

        assert_eq!(event, "clean:failed");
        assert_eq!(
            payload,
            json!({
                "targetId": "target-1",
                "message": "Cleanup cancelled before deletion",
                "cancelled": true,
            })
        );
    }
}

#[tauri::command]
pub async fn clean_target(app: AppHandle, request: CleanRequest) -> Result<CleanResult, String> {
    let target_id = request.target_id.clone();
    let mode = request.mode;
    let confirmation = request.confirmation.clone();
    let (registered, control) =
        ScanService::claim_target_for_cleanup(&target_id).map_err(|error| error.to_string())?;
    let settings = match settings_for_clean(mode, || crate::commands::settings::load_settings(&app))
    {
        Ok(settings) => settings,
        Err(error) => {
            ScanService::release_cleanup(&target_id);
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
        CleanService::clean_registered_target(
            registered,
            control,
            settings.as_ref(),
            mode,
            confirmation,
        )
    })
    .await
    .map_err(|error| {
        ScanService::release_cleanup(&target_id);
        error.to_string()
    })?;

    let (event, payload) = clean_event_for_result(&target_id, &result);

    match result {
        Ok(clean_result) => {
            ScanService::finish_cleanup(&target_id);
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
            let _ = app.emit(event, payload);
            Ok(clean_result)
        }
        Err(error) => {
            ScanService::release_cleanup(&target_id);
            crate::logging::error(
                "clean",
                &format!("failed targetId=\"{}\" error=\"{}\"", target_id, error),
            );
            let _ = app.emit(event, payload);
            Err(error.to_string())
        }
    }
}
