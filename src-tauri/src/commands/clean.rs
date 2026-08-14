use crate::commands::settings::AppSettings;
use crate::models::action::{CleanRequest, CleanResult};
use crate::services::clean_service::CleanService;
use crate::services::scan_service::{error_event, platform, ScanService};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CleanupEventResult {
    target_id: String,
    freed_bytes: u64,
    size_has_errors: bool,
}

fn clean_started_event(
    target_id: &str,
    mode: crate::models::action::CleanMode,
) -> uncached_core::contract::v1::ApiEnvelope<serde_json::Value> {
    uncached_core::contract::v1::ApiEnvelope::success(
        platform(),
        serde_json::json!({ "targetId": target_id, "mode": mode }),
    )
}

fn clean_finished_event(
    target_id: &str,
    result: &CleanResult,
) -> uncached_core::contract::v1::ApiEnvelope<CleanupEventResult> {
    uncached_core::contract::v1::ApiEnvelope::success(
        platform(),
        CleanupEventResult {
            target_id: target_id.to_owned(),
            freed_bytes: result.freed_bytes,
            size_has_errors: result.size_has_errors,
        },
    )
}

fn clean_command_failure(
    error: &crate::errors::NukeError,
) -> uncached_core::contract::v1::ApiEnvelope<CleanResult> {
    uncached_core::contract::v1::ApiEnvelope::failure(
        platform(),
        crate::services::scan_service::public_error_info(error),
    )
}

fn internal_command_failure() -> uncached_core::contract::v1::ApiEnvelope<CleanResult> {
    uncached_core::contract::v1::ApiEnvelope::failure(
        platform(),
        uncached_core::CoreError::Io(std::io::Error::other("desktop command failure"))
            .public_info(),
    )
}

fn clean_failed_event(
    _target_id: &str,
    error: &crate::errors::NukeError,
) -> uncached_core::contract::v1::ApiEnvelope<serde_json::Value> {
    error_event(error)
}

#[tauri::command]
pub fn cleanup_capabilities(
) -> uncached_core::contract::v1::ApiEnvelope<uncached_core::contract::v1::CleanupCapabilities> {
    uncached_core::contract::v1::ApiEnvelope::success(
        platform(),
        uncached_core::cleanup_capabilities(),
    )
}

fn clean_event_for_result(
    target_id: &str,
    result: &crate::errors::NukeResult<CleanResult>,
) -> (&'static str, serde_json::Value) {
    match result {
        Ok(clean_result) => (
            "clean:finished",
            serde_json::to_value(clean_finished_event(target_id, clean_result)).unwrap(),
        ),
        Err(error) => (
            "clean:failed",
            serde_json::to_value(clean_failed_event(target_id, error)).unwrap(),
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
    use super::{
        clean_command_failure, clean_event_for_result, clean_failed_event, clean_finished_event,
        clean_started_event, cleanup_capabilities, internal_command_failure, platform,
        settings_for_clean, should_record_cleanup,
    };
    use crate::commands::settings::AppSettings;
    use crate::errors::NukeError;
    use crate::models::action::{CleanMode, CleanResult};
    use crate::models::category::Category;
    use crate::models::target::ScanTarget;
    use crate::services::clean_service::CleanService;
    use crate::services::scan_service::{CleanupControl, RegisteredTarget};
    use std::path::PathBuf;
    use std::sync::Arc;

    #[test]
    fn clean_started_event_serializes_as_v1() {
        let value =
            serde_json::to_value(clean_started_event("target-1", CleanMode::Trash)).unwrap();

        assert_eq!(value["apiVersion"], "v1");
        assert!(value["platform"].is_string());
        assert_eq!(value["data"]["targetId"], "target-1");
        assert_eq!(value["data"]["mode"], "Trash");
        assert!(value["error"].is_null());
    }

    #[test]
    fn cleanup_capabilities_preserve_core_runtime_probe() {
        let envelope = cleanup_capabilities();
        let capabilities = uncached_core::cleanup_capabilities();
        let value = serde_json::to_value(envelope).unwrap();

        assert_eq!(value["platform"], serde_json::to_value(platform()).unwrap());
        assert_eq!(value["data"], serde_json::to_value(&capabilities).unwrap());
        assert!(value["error"].is_null());
        if !cfg!(any(windows, unix)) {
            assert!(!capabilities.move_to_trash);
        }
    }

    #[test]
    fn clean_finished_event_serializes_cleanup_dto() {
        let result = CleanResult {
            success: true,
            target_path: r"C:\workspace\target".into(),
            freed_bytes: 42,
            size_has_errors: false,
            mode_used: CleanMode::Permanent,
            message: None,
        };
        let value = serde_json::to_value(clean_finished_event("target-1", &result)).unwrap();

        assert_eq!(value["apiVersion"], "v1");
        assert_eq!(value["data"]["targetId"], "target-1");
        assert_eq!(value["data"]["freedBytes"], 42);
        assert_eq!(value["data"]["sizeHasErrors"], false);
        assert!(value["data"].get("targetPath").is_none());
        assert!(value["error"].is_null());
    }

    #[test]
    fn cleanup_command_errors_are_sanitized_v1_failures() {
        for error in [
            NukeError::NotFound("native target detail".into()),
            NukeError::CleanupCancelled,
            NukeError::PermissionDenied("native permission detail".into()),
        ] {
            let value = serde_json::to_value(clean_command_failure(&error)).unwrap();
            assert_eq!(value["apiVersion"], "v1");
            assert!(value["data"].is_null());
            assert!(value["error"]["code"].is_string());
            assert!(!value.to_string().contains("native"));
        }
    }

    #[test]
    fn settings_and_blocking_failures_are_sanitized_v1_failures() {
        let value = serde_json::to_value(internal_command_failure()).unwrap();
        assert_eq!(value["apiVersion"], "v1");
        assert_eq!(value["error"]["code"], "io");
        assert_eq!(value["error"]["message"], "I/O error");
        assert!(value["data"].is_null());
        assert!(!value.to_string().contains("native"));
    }

    #[test]
    fn clean_failed_event_has_v1_error_and_null_data() {
        let value =
            serde_json::to_value(clean_failed_event("target-1", &NukeError::CleanupCancelled))
                .unwrap();

        assert_eq!(value["apiVersion"], "v1");
        assert!(value["data"].is_null());
        assert_eq!(value["error"]["code"], "io");
        assert_eq!(value["error"]["message"], "I/O error");
        assert!(!value.to_string().contains("Cleanup cancelled"));
    }

    #[test]
    fn cleanup_command_preserves_core_error_codes() {
        let errors = [
            uncached_core::CoreError::TargetIdentityChanged {
                path: "target".into(),
            },
            uncached_core::CoreError::TargetIdentityUnavailable {
                path: "target".into(),
            },
            uncached_core::CoreError::TargetReparsePoint {
                path: "target".into(),
            },
            uncached_core::CoreError::SecureTrashUnavailable,
        ];
        let codes = [
            "target_identity_changed",
            "target_identity_unavailable",
            "target_reparse_point",
            "secure_trash_unavailable",
        ];

        for (error, code) in errors.into_iter().zip(codes) {
            let value =
                serde_json::to_value(clean_command_failure(&NukeError::Core(error.public_info())))
                    .unwrap();
            assert_eq!(value["error"]["code"], code);
        }
    }

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
        assert_eq!(payload["apiVersion"], "v1");
        assert!(payload["data"].is_null());
        assert_eq!(payload["error"]["code"], "io");
    }
}

#[tauri::command]
pub async fn clean_target(
    app: AppHandle,
    request: CleanRequest,
) -> uncached_core::contract::v1::ApiEnvelope<CleanResult> {
    let target_id = request.target_id.clone();
    let mode = request.mode;
    let confirmation = request.confirmation.clone();
    let (registered, control) = match ScanService::claim_target_for_cleanup(&target_id) {
        Ok(value) => value,
        Err(error) => return clean_command_failure(&error),
    };
    if !crate::commands::entitlements::is_free_category(&registered.target.category)
        && !crate::commands::entitlements::current_status().pro_enabled
    {
        ScanService::release_cleanup(&target_id);
        return clean_command_failure(&crate::errors::NukeError::PermissionDenied(
            "This cleaner requires Uncached Pro".to_string(),
        ));
    }
    let settings = match settings_for_clean(mode, || crate::commands::settings::load_settings(&app))
    {
        Ok(settings) => settings,
        Err(_error) => {
            ScanService::release_cleanup(&target_id);
            return internal_command_failure();
        }
    };
    crate::logging::info(
        "clean",
        &format!("started targetId=\"{}\" mode=\"{:?}\"", target_id, mode),
    );
    let _ = app.emit("clean:started", clean_started_event(&target_id, mode));

    let result = match tauri::async_runtime::spawn_blocking(move || {
        CleanService::clean_registered_target(
            registered,
            control,
            settings.as_ref(),
            mode,
            confirmation,
        )
    })
    .await
    {
        Ok(result) => result,
        Err(_error) => {
            ScanService::release_cleanup(&target_id);
            let envelope = internal_command_failure();
            let _ = app.emit("clean:failed", serde_json::to_value(&envelope).unwrap());
            return envelope;
        }
    };

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
            // Recorded for every mode, unlike the line above. The running total
            // in settings is tied to the Trash flow; the history answers "what
            // has this product removed for me", and a permanent delete removed
            // it just as much.
            if let Err(error) = crate::commands::history::record_cleanup(&app, clean_result.freed_bytes)
            {
                crate::logging::warn(
                    "history",
                    &format!("failed to append cleanup entry error=\"{}\"", error),
                );
            }
            crate::logging::info(
                "clean",
                &format!(
                    "success targetId=\"{}\" bytes={} sizeHasErrors={}",
                    target_id, clean_result.freed_bytes, clean_result.size_has_errors
                ),
            );
            let _ = app.emit(event, payload);
            uncached_core::contract::v1::ApiEnvelope::success(platform(), clean_result)
        }
        Err(error) => {
            ScanService::release_cleanup(&target_id);
            crate::logging::error(
                "clean",
                &format!("failed targetId=\"{}\" error=\"{}\"", target_id, error),
            );
            let _ = app.emit(event, payload);
            clean_command_failure(&error)
        }
    }
}
