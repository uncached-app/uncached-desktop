use crate::cleaner::permanent::PermanentCleaner;
use crate::cleaner::trash::TrashCleaner;
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
                let cleaner = TrashCleaner;
                cleaner.clean(&target_path)?
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
    use super::validate_confirmation;
    use crate::models::action::CleanMode;

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
}
