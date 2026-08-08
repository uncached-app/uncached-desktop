pub mod gradle;
pub mod next;
pub mod node_modules;
pub mod python;
pub mod rust;
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
            .map(chrono::DateTime::<chrono::Utc>::from);

        Some(ScanTarget::pending(
            dir_path.to_path_buf(),
            category,
            last_modified,
        ))
    }
}

/// Returns all default scanners registered in Uncached.
pub fn get_default_scanners(
    settings: &crate::commands::settings::AppSettings,
) -> Vec<Box<dyn Scanner>> {
    let mut scanners: Vec<Box<dyn Scanner>> = Vec::new();
    if settings.detect_node_modules {
        scanners.push(Box::new(node_modules::NodeModulesScanner));
    }
    if settings.detect_cargo_target {
        scanners.push(Box::new(rust::CargoTargetScanner));
    }
    scanners.push(Box::new(python::PyCacheScanner));
    if settings.detect_gradle_cache {
        scanners.push(Box::new(gradle::GradleScanner));
    }
    if settings.detect_next_cache {
        scanners.push(Box::new(next::NextCacheScanner));
    }
    if settings.detect_turbo_cache {
        scanners.push(Box::new(turbo::TurboCacheScanner));
    }
    scanners
}

pub fn get_default_providers(
    settings: &crate::commands::settings::AppSettings,
) -> uncached_core::ProviderSet {
    let mut providers = uncached_core::ProviderSet::new();
    if settings.detect_node_modules {
        providers.add_scanner(node_modules::NodeModulesScanner);
    }
    if settings.detect_cargo_target {
        providers.add_scanner(rust::CargoTargetScanner);
    }
    if settings.detect_next_cache {
        providers.add_scanner(next::NextCacheScanner);
    }
    if settings.detect_turbo_cache {
        providers.add_scanner(turbo::TurboCacheScanner);
    }
    providers.add_scanner(python::PyCacheScanner);
    if settings.detect_gradle_cache {
        providers.add_scanner(gradle::GradleScanner);
    }
    providers
}

#[cfg(test)]
mod tests {
    use super::get_default_providers;
    use crate::commands::settings::AppSettings;
    use uncached_core::{Category, ProviderSet};

    fn active_categories(providers: &ProviderSet) -> Vec<Category> {
        [
            Category::NodeModules,
            Category::CargoTarget,
            Category::NextJs,
            Category::Turbo,
            Category::PyCache,
            Category::Gradle,
        ]
        .into_iter()
        .filter(|category| providers.scanner_for(category.clone()).is_some())
        .collect()
    }

    #[test]
    fn default_settings_register_six_active_provider_categories() {
        let providers = get_default_providers(&AppSettings::default());
        let categories = active_categories(&providers);

        assert_eq!(providers.len(), 6);
        assert_eq!(categories.len(), 6);
    }

    #[test]
    fn disabling_optional_provider_removes_only_that_category() {
        let cases = [
            ("node_modules", Category::NodeModules),
            ("cargo target", Category::CargoTarget),
            ("gradle", Category::Gradle),
            ("next", Category::NextJs),
            ("turbo", Category::Turbo),
        ];

        for (name, removed) in cases {
            let mut settings = AppSettings::default();
            match removed {
                Category::NodeModules => {
                    assert!(settings.detect_node_modules);
                    settings.detect_node_modules = false;
                }
                Category::CargoTarget => {
                    assert!(settings.detect_cargo_target);
                    settings.detect_cargo_target = false;
                }
                Category::Gradle => {
                    assert!(settings.detect_gradle_cache);
                    settings.detect_gradle_cache = false;
                }
                Category::NextJs => {
                    assert!(settings.detect_next_cache);
                    settings.detect_next_cache = false;
                }
                Category::Turbo => {
                    assert!(settings.detect_turbo_cache);
                    settings.detect_turbo_cache = false;
                }
                _ => unreachable!(),
            }
            let providers = get_default_providers(&settings);
            let categories = active_categories(&providers);

            assert_eq!(providers.len(), 5, "{name} provider count");
            assert_eq!(categories.len(), 5, "{name} active categories");
            assert!(providers.scanner_for(Category::PyCache).is_some());
            assert!(
                providers.scanner_for(removed).is_none(),
                "{name} should be removed"
            );
        }
    }
}
