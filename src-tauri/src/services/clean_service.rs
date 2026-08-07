use crate::cleaner::permanent::PermanentCleaner;
use crate::cleaner::Cleaner;
use crate::errors::NukeResult;
use crate::filesystem::paths::{canonicalize_target, is_within_root};
use crate::models::action::{CleanMode, CleanResult};
use crate::services::scan_service::RegisteredTarget;

pub struct CleanService;

impl CleanService {
    pub fn clean_registered_target(
        registered: RegisteredTarget,
        mode: CleanMode,
        confirmation: Option<String>,
    ) -> NukeResult<CleanResult> {
        validate_confirmation(mode, confirmation.as_deref())?;

        let target_path = canonicalize_target(&registered.target.path)?;
        if !is_within_root(&registered.root_path, &target_path) {
            return Err(crate::errors::NukeError::PermissionDenied(
                "Target is outside its scan root".to_string(),
            ));
        }

        let clean_report = match mode {
            CleanMode::Trash => {
                if registered.target.category == crate::models::category::Category::NodeModules {
                    let target = uncached_core::ScanTarget::new(
                        registered.target.path.clone(),
                        uncached_core::Category::NodeModules,
                        registered.target.size_bytes,
                    );
                    let report = uncached_core::clean_to_trash(&registered.root_path, &target)
                        .map_err(map_core_error)?;
                    crate::cleaner::CleanReport {
                        freed_bytes: report.freed_bytes,
                        size_has_errors: false,
                    }
                } else {
                    return Err(crate::errors::NukeError::Internal(
                        "Unsupported trash category".to_string(),
                    ));
                }
            }
            CleanMode::Permanent => {
                let cleaner = PermanentCleaner;
                cleaner.clean(&target_path)?
            }
        };

        Ok(CleanResult {
            success: true,
            target_path: target_path.to_string_lossy().to_string(),
            freed_bytes: clean_report.freed_bytes,
            size_has_errors: clean_report.size_has_errors,
            mode_used: mode,
            message: None,
        })
    }
}

fn map_core_error(error: uncached_core::CoreError) -> crate::errors::NukeError {
    match error {
        uncached_core::CoreError::Io(error) => crate::errors::NukeError::Io(error),
        uncached_core::CoreError::RecycleBinTooLarge => {
            crate::errors::NukeError::RecycleBinTooLarge
        }
        uncached_core::CoreError::Trash(message) => crate::errors::NukeError::Trash(message),
        other => crate::errors::NukeError::PermissionDenied(other.to_string()),
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
    use crate::services::scan_service::RegisteredTarget;

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
        let target = ScanTarget::new(target_path.clone(), Category::NodeModules, 0, false, None);

        let result = CleanService::clean_registered_target(
            RegisteredTarget {
                target,
                root_path: root.clone(),
            },
            CleanMode::Trash,
            None,
        );

        assert!(result.is_err());
        assert!(target_path.exists());
        let _ = std::fs::remove_dir_all(root);
    }
}
