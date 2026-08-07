pub mod gradle;
pub mod node_modules;
pub mod python;
pub mod rust;
pub mod next;
pub mod turbo;

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

        let category = self.category();
        let metadata = std::fs::metadata(dir_path).ok();
        let last_modified = metadata
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t));

        Some(ScanTarget::pending(
            dir_path.to_path_buf(),
            category,
            last_modified,
        ))
    }
}

/// Returns all default scanners registered in Uncached.
pub fn get_default_scanners(settings: &crate::commands::settings::AppSettings) -> Vec<Box<dyn Scanner>> {
    let mut scanners: Vec<Box<dyn Scanner>> = Vec::new();
    if settings.detect_node_modules { scanners.push(Box::new(node_modules::NodeModulesScanner)); }
    if settings.detect_cargo_target { scanners.push(Box::new(rust::CargoTargetScanner)); }
    scanners.push(Box::new(python::PyCacheScanner));
    if settings.detect_gradle_cache { scanners.push(Box::new(gradle::GradleScanner)); }
    if settings.detect_next_cache { scanners.push(Box::new(next::NextCacheScanner)); }
    if settings.detect_turbo_cache { scanners.push(Box::new(turbo::TurboCacheScanner)); }
    scanners
}
