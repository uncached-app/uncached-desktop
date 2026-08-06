pub mod gradle;
pub mod node_modules;
pub mod python;
pub mod rust;

use crate::models::category::Category;
use crate::models::target::ScanTarget;
use std::path::Path;

pub trait Scanner: Send + Sync {
    /// Returns the target category detected by this scanner.
    fn category(&self) -> Category;

    /// Checks if a given directory path name matches this scanner's criteria.
    fn matches(&self, dir_name: &str) -> bool;

    /// Verifies if parent context confirms this target (e.g. package.json exists near node_modules).
    fn confirm_context(&self, dir_path: &Path) -> bool {
        let _ = dir_path;
        true
    }

    /// Creates a ScanTarget from a matched path.
    fn create_target(&self, dir_path: &Path) -> Option<ScanTarget> {
        if !self.confirm_context(dir_path) {
            return None;
        }

        let size = crate::filesystem::size::calculate_dir_size_report(dir_path);
        let metadata = std::fs::metadata(dir_path).ok();
        let last_modified = metadata
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t));

        Some(ScanTarget::new(
            dir_path.to_path_buf(),
            self.category(),
            size.bytes,
            size.errors > 0,
            last_modified,
        ))
    }
}

/// Returns all default scanners registered in Nuke Modules.
pub fn get_default_scanners() -> Vec<Box<dyn Scanner>> {
    vec![
        Box::new(node_modules::NodeModulesScanner),
        Box::new(rust::CargoTargetScanner),
        Box::new(python::PyCacheScanner),
        Box::new(gradle::GradleScanner),
    ]
}
