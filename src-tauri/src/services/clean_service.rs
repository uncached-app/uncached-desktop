use crate::cleaner::permanent::PermanentCleaner;
use crate::cleaner::Cleaner;
use crate::commands::settings::AppSettings;
use crate::errors::NukeResult;
use crate::filesystem::paths::{canonicalize_target, is_within_root};
use crate::models::action::{CleanMode, CleanResult};
use crate::services::scan_service::RegisteredTarget;

pub struct CleanService;

impl CleanService {
    pub fn clean_registered_target(
        registered: RegisteredTarget,
        settings: &AppSettings,
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
                let target = uncached_core::ScanTarget::new(
                    registered.target.path.clone(),
                    core_category(&registered.target.category),
                    registered.target.size_bytes,
                )
                .with_identity(registered.target.identity);
                let providers = crate::scanner::get_default_providers(settings);
                let report =
                    uncached_core::clean_to_trash(&registered.root_path, &providers, &target)
                        .map_err(map_core_error)?;
                crate::cleaner::CleanReport {
                    freed_bytes: report.freed_bytes,
                    size_has_errors: registered.target.size_has_errors || report.size_has_errors,
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

fn core_category(category: &crate::models::category::Category) -> uncached_core::Category {
    match category {
        crate::models::category::Category::NodeModules => uncached_core::Category::NodeModules,
        crate::models::category::Category::CargoTarget => uncached_core::Category::CargoTarget,
        crate::models::category::Category::NextJs => uncached_core::Category::NextJs,
        crate::models::category::Category::Turbo => uncached_core::Category::Turbo,
        crate::models::category::Category::DotNetObj => uncached_core::Category::DotNetObj,
        crate::models::category::Category::PyCache => uncached_core::Category::PyCache,
        crate::models::category::Category::Gradle => uncached_core::Category::Gradle,
        crate::models::category::Category::Docker => uncached_core::Category::Docker,
        crate::models::category::Category::Custom(name) => {
            uncached_core::Category::Custom(name.clone())
        }
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
    use crate::commands::settings::AppSettings;
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
            &AppSettings::default(),
            CleanMode::Trash,
            None,
        );

        assert!(result.is_err());
        assert!(target_path.exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn active_non_node_modules_category_uses_core_trash_cleanup() {
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
        let target = ScanTarget::new(target_path, Category::CargoTarget, 4, false, None);

        let result = CleanService::clean_registered_target(
            RegisteredTarget {
                target,
                root_path: root.clone(),
            },
            &AppSettings::default(),
            CleanMode::Trash,
            None,
        );

        assert!(result.is_ok());
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
        let target = ScanTarget::new(target_path.clone(), Category::CargoTarget, 0, false, None);
        let settings = AppSettings {
            detect_cargo_target: false,
            ..AppSettings::default()
        };

        let result = CleanService::clean_registered_target(
            RegisteredTarget {
                target,
                root_path: root.clone(),
            },
            &settings,
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
        let target = ScanTarget::new(target_path.clone(), Category::NextJs, 0, false, None);

        let result = CleanService::clean_registered_target(
            RegisteredTarget {
                target,
                root_path: root.clone(),
            },
            &AppSettings::default(),
            CleanMode::Trash,
            None,
        );

        assert!(result.is_err());
        assert!(target_path.exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn node_modules_cleanup_preserves_existing_size_error() {
        let root = std::env::temp_dir().join(format!("uncached-clean-size-{}", std::process::id()));
        let target_path = root.join("project/node_modules");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&target_path).unwrap();
        std::fs::write(root.join("project/package.json"), b"{}").unwrap();
        let target = ScanTarget::new(target_path, Category::NodeModules, 0, true, None);

        let result = CleanService::clean_registered_target(
            RegisteredTarget {
                target,
                root_path: root.clone(),
            },
            &AppSettings::default(),
            CleanMode::Trash,
            None,
        )
        .unwrap();

        assert!(result.size_has_errors);
    }
}
