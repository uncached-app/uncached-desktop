use crate::commands::settings::AppSettings;
use crate::models::action::{CleanRequest, CleanResult};
use crate::services::clean_service::CleanService;
use crate::services::scan_service::{platform, ScanService};
use tauri::AppHandle;

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

#[tauri::command]
pub fn cleanup_capabilities(
) -> uncached_core::contract::v1::ApiEnvelope<uncached_core::contract::v1::CleanupCapabilities> {
    uncached_core::contract::v1::ApiEnvelope::success(
        platform(),
        uncached_core::cleanup_capabilities(),
    )
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
        clean_command_failure, cleanup_capabilities, internal_command_failure, platform,
        settings_for_clean, should_record_cleanup,
    };
    use crate::commands::settings::AppSettings;
    use crate::errors::NukeError;
    use crate::models::action::CleanMode;
    use crate::models::category::Category;
    use crate::models::target::ScanTarget;
    use crate::services::clean_service::CleanService;
    use crate::services::scan_service::{CleanupControl, RegisteredTarget};
    use std::path::PathBuf;
    use std::sync::Arc;

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
    fn a_cancelled_cleanup_fails_rather_than_reporting_a_removal() {
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
                ),
                root_path: PathBuf::from(r"C:\workspace"),
                providers: Arc::new(crate::scanner::get_default_providers(&settings)),
                owner: &[],
            },
            control,
            Some(&settings),
            CleanMode::Trash,
            None,
        );

        let Err(error) = result else {
            panic!("a cancelled cleanup must not report a removal");
        };
        assert!(matches!(error, NukeError::CleanupCancelled));
        let envelope = serde_json::to_value(clean_command_failure(&error)).unwrap();
        assert!(envelope["data"].is_null());
        assert_eq!(envelope["error"]["code"], "io");
    }
}

#[tauri::command]
pub async fn clean_target(
    app: AppHandle,
    request: CleanRequest,
) -> uncached_core::contract::v1::ApiEnvelope<CleanResult> {
    perform_clean(&app, request).await
}

/// Removes one registered target: claim, entitlement, validation, removal,
/// history.
///
/// Separated from the command so that the scheduler calls *this* rather than
/// reimplementing it. Everything that decides whether a deletion is allowed
/// lives between here and `CleanService`, and only one of those two re-checks
/// the licence — a second caller that reproduced the sequence and dropped the
/// check at line one would clean Pro categories on a Free install. There is one
/// door, and a run nobody is watching goes through it exactly like a click.
pub(crate) async fn perform_clean(
    app: &AppHandle,
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
    let settings = match settings_for_clean(mode, || crate::commands::settings::load_settings(app))
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
    // Taken before the registration moves into the worker: what was removed is
    // only knowable from the target, and by the time it is gone this is the
    // only place that still says what it was.
    let category = registered.target.category.clone();
    let cleaned_path = registered.target.path.clone();
    let root_path = registered.root_path.clone();

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
            return internal_command_failure();
        }
    };

    match result {
        Ok(clean_result) => {
            ScanService::finish_cleanup(&target_id);
            if should_record_cleanup(mode) {
                if let Err(error) =
                    crate::commands::settings::record_cleanup(app, clean_result.freed_bytes)
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
            if let Err(error) = crate::commands::history::record_cleanup(
                app,
                crate::commands::history::CleanupRecord {
                    freed_bytes: clean_result.freed_bytes,
                    category: &category,
                    path: &cleaned_path,
                    workspace: &root_path,
                    mode,
                    trigger: request.trigger,
                },
            ) {
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
            uncached_core::contract::v1::ApiEnvelope::success(platform(), clean_result)
        }
        Err(error) => {
            ScanService::release_cleanup(&target_id);
            crate::logging::error(
                "clean",
                &format!("failed targetId=\"{}\" error=\"{}\"", target_id, error),
            );
            clean_command_failure(&error)
        }
    }
}
