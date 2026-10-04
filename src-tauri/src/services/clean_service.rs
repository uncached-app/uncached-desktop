use crate::errors::NukeResult;
use crate::models::action::{CleanMode, CleanResult};
use crate::services::scan_service::{CleanupControl, RegisteredTarget};
use crate::settings::AppSettings;
use std::sync::Arc;

pub struct CleanService;

impl CleanService {
    pub fn clean_registered_target(
        registered: RegisteredTarget,
        control: Arc<CleanupControl>,
        settings: Option<&AppSettings>,
        mode: CleanMode,
        confirmation: Option<String>,
    ) -> NukeResult<CleanResult> {
        validate_confirmation(mode, confirmation.as_deref())?;
        // Asked here rather than trusted from the scan.
        //
        // The row already says so, but a scan and a removal are minutes apart
        // and starting the tool in between is the ordinary case, not an exotic
        // one. A guarantee that lives only in the interface is a guarantee the
        // interface can forget to make — this is the same reasoning that keeps
        // `validate_clean_target` below rather than in the screen that offers
        // the button.
        if let Some(owner) = crate::workspace::running::first_running(
            registered.owner,
            &crate::workspace::running::running_commands(),
        ) {
            return Err(crate::errors::NukeError::InUse(owner.to_owned()));
        }
        if mode == CleanMode::Trash && settings.is_none() {
            return Err(crate::errors::NukeError::PermissionDenied(
                "Trash cleanup requires settings".to_string(),
            ));
        }
        if control.is_cancelled() {
            return Err(crate::errors::NukeError::CleanupCancelled);
        }

        let target = uncached_core::ScanTarget::new(
            registered.target.path.clone(),
            registered.target.category.clone(),
            registered.target.size_bytes,
        )
        .with_identity(registered.target.identity);

        let target_path = uncached_core::validate_clean_target(
            &registered.root_path,
            &registered.providers,
            &target,
        )
        .map_err(map_core_error)?;

        if !control.begin_execution() {
            return Err(crate::errors::NukeError::CleanupCancelled);
        }

        let clean_report = match mode {
            CleanMode::Trash => {
                uncached_core::clean_to_trash(&registered.root_path, &registered.providers, &target)
                    .map_err(map_core_error)?
            }
            CleanMode::Permanent => uncached_core::clean_permanently(
                &registered.root_path,
                &registered.providers,
                &target,
            )
            .map_err(map_core_error)?,
        };

        Ok(CleanResult {
            success: true,
            target_path: target_path.to_string_lossy().to_string(),
            freed_bytes: clean_report.freed_bytes,
            size_has_errors: registered.target.size_has_errors || clean_report.size_has_errors,
            mode_used: mode,
            message: None,
        })
    }
}

fn map_core_error(error: uncached_core::CoreError) -> crate::errors::NukeError {
    // The native cause is dropped by `public_info` before the error can cross
    // IPC, so record it in the local log first. Without this a cleanup failure
    // is only ever visible as its sanitized code.
    crate::logging::error("clean", &format!("core error=\"{error}\""));
    match error {
        uncached_core::CoreError::Io(error) => crate::errors::NukeError::Io(error),
        // Every other Core failure is already a typed, sanitized contract error.
        other => crate::errors::NukeError::Core(other.public_info()),
    }
}

fn validate_confirmation(mode: CleanMode, confirmation: Option<&str>) -> NukeResult<()> {
    if mode == CleanMode::Permanent && confirmation != Some("Nuke") {
        return Err(crate::errors::NukeError::PermissionDenied(
            "Permanent deletion requires typing Nuke".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{validate_confirmation, CleanService};
    use crate::models::action::CleanMode;
    use crate::models::category::Category;
    use crate::models::target::ScanTarget;
    use crate::services::scan_service::{CleanupControl, RegisteredTarget};
    use crate::settings::AppSettings;
    use std::path::PathBuf;

    fn registered_target(
        target: ScanTarget,
        root_path: PathBuf,
        settings: &AppSettings,
    ) -> RegisteredTarget {
        RegisteredTarget {
            target,
            root_path,
            providers: std::sync::Arc::new(crate::scanner::get_default_providers(settings)),
            owner: &[],
        }
    }

    #[test]
    fn clean_registered_target_rejects_cancellation_before_secure_preparation() {
        let root = std::env::temp_dir().join(format!(
            "uncached-clean-cancel-before-preparation-{}",
            std::process::id()
        ));
        let target_path = root.join("project/node_modules");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&target_path).unwrap();
        let target = ScanTarget::new(target_path.clone(), Category::NodeModules, 0, false);
        let control = std::sync::Arc::new(CleanupControl::new());
        assert!(control.request_cancel());

        let result = CleanService::clean_registered_target(
            registered_target(target, root.clone(), &AppSettings::default()),
            control,
            Some(&AppSettings::default()),
            CleanMode::Trash,
            None,
        );

        assert!(matches!(
            result,
            Err(crate::errors::NukeError::CleanupCancelled)
        ));
        assert!(target_path.exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn permanent_mode_requires_exact_nuke_confirmation() {
        assert!(validate_confirmation(CleanMode::Permanent, None).is_err());
        assert!(validate_confirmation(CleanMode::Permanent, Some("nuke")).is_err());
        assert!(validate_confirmation(CleanMode::Permanent, Some("Nuke")).is_ok());
    }

    #[test]
    fn trash_mode_does_not_require_confirmation() {
        assert!(validate_confirmation(CleanMode::Trash, None).is_ok());
    }

    #[test]
    fn node_modules_trash_validates_core_context_before_deletion() {
        let root = std::env::temp_dir().join(format!("uncached-clean-core-{}", std::process::id()));
        let target_path = root.join("project/node_modules");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&target_path).unwrap();
        let target = ScanTarget::new(target_path.clone(), Category::NodeModules, 0, false);

        let result = CleanService::clean_registered_target(
            registered_target(target, root.clone(), &AppSettings::default()),
            std::sync::Arc::new(CleanupControl::new()),
            Some(&AppSettings::default()),
            CleanMode::Trash,
            None,
        );

        assert!(result.is_err());
        assert!(target_path.exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn active_non_node_modules_category_handles_runtime_trash_result() {
        let root =
            std::env::temp_dir().join(format!("uncached-clean-desktop-{}", std::process::id()));
        let target_path = root.join("project/target");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&target_path).unwrap();
        std::fs::write(target_path.join("build.js"), b"1234").unwrap();
        std::fs::write(
            root.join("project/Cargo.toml"),
            b"[package]\nname = \"fixture\"\nversion = \"0.1.0\"\n",
        )
        .unwrap();
        let mut target = ScanTarget::new(target_path.clone(), Category::CargoTarget, 4, false);
        target.identity = uncached_core::filesystem::file_identity(&target_path);

        let result = CleanService::clean_registered_target(
            registered_target(target, root.clone(), &AppSettings::default()),
            std::sync::Arc::new(CleanupControl::new()),
            Some(&AppSettings::default()),
            CleanMode::Trash,
            None,
        );

        match result {
            Ok(_) => assert!(!target_path.exists()),
            Err(crate::errors::NukeError::Core(info)) => {
                assert!(matches!(
                    info.code,
                    uncached_core::CoreErrorCode::SecureTrashUnavailable
                        | uncached_core::CoreErrorCode::SecureTrashInitializationFailed
                        | uncached_core::CoreErrorCode::SecureTrashOperationFailed
                        | uncached_core::CoreErrorCode::SecureTrashAborted
                        | uncached_core::CoreErrorCode::SecureTrashPostconditionFailed
                        | uncached_core::CoreErrorCode::TargetReparsePoint
                ));
                assert!(target_path.exists());
            }
            Err(error) => panic!("unexpected typed Trash result: {error:?}"),
        }
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn disabled_non_node_modules_provider_rejects_trash_and_preserves_target() {
        let root =
            std::env::temp_dir().join(format!("uncached-clean-disabled-{}", std::process::id()));
        let target_path = root.join("project/target");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&target_path).unwrap();
        std::fs::write(
            root.join("project/Cargo.toml"),
            b"[package]\nname = \"fixture\"\nversion = \"0.1.0\"\n",
        )
        .unwrap();
        let target = ScanTarget::new(target_path.clone(), Category::CargoTarget, 0, false);
        let settings = AppSettings {
            ..AppSettings::default()
        };

        let result = CleanService::clean_registered_target(
            registered_target(target, root.clone(), &settings),
            std::sync::Arc::new(CleanupControl::new()),
            Some(&settings),
            CleanMode::Trash,
            None,
        );

        assert!(result.is_err());
        assert!(target_path.exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn invalid_non_node_modules_context_rejects_trash_and_preserves_target() {
        let root =
            std::env::temp_dir().join(format!("uncached-clean-context-{}", std::process::id()));
        let target_path = root.join("project/.next");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&target_path).unwrap();
        let target = ScanTarget::new(target_path.clone(), Category::NextJs, 0, false);

        let result = CleanService::clean_registered_target(
            registered_target(target, root.clone(), &AppSettings::default()),
            std::sync::Arc::new(CleanupControl::new()),
            Some(&AppSettings::default()),
            CleanMode::Trash,
            None,
        );

        assert!(result.is_err());
        assert!(target_path.exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn node_modules_cleanup_preserves_existing_size_error_across_runtime_trash_result() {
        let root = std::env::temp_dir().join(format!("uncached-clean-size-{}", std::process::id()));
        let target_path = root.join("project/node_modules");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&target_path).unwrap();
        std::fs::write(root.join("project/package.json"), b"{}").unwrap();
        let mut target = ScanTarget::new(target_path.clone(), Category::NodeModules, 0, true);
        target.identity = uncached_core::filesystem::file_identity(&target_path);

        let result = CleanService::clean_registered_target(
            registered_target(target, root.clone(), &AppSettings::default()),
            std::sync::Arc::new(CleanupControl::new()),
            Some(&AppSettings::default()),
            CleanMode::Trash,
            None,
        );

        match result {
            Ok(clean_result) => {
                assert!(!target_path.exists());
                assert!(clean_result.size_has_errors);
            }
            Err(crate::errors::NukeError::Core(info)) => {
                assert!(matches!(
                    info.code,
                    uncached_core::CoreErrorCode::SecureTrashUnavailable
                        | uncached_core::CoreErrorCode::SecureTrashInitializationFailed
                        | uncached_core::CoreErrorCode::SecureTrashOperationFailed
                        | uncached_core::CoreErrorCode::SecureTrashAborted
                        | uncached_core::CoreErrorCode::SecureTrashPostconditionFailed
                        | uncached_core::CoreErrorCode::TargetReparsePoint
                ));
                assert!(target_path.exists());
            }
            Err(error) => panic!("unexpected typed Trash result: {error:?}"),
        }
        let _ = std::fs::remove_dir_all(root);
    }
}
