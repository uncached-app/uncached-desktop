pub fn get_default_providers(
    settings: &crate::commands::settings::AppSettings,
) -> uncached_core::ProviderSet {
    let mut providers = uncached_core::ProviderSet::new();
    if settings.detect_node_modules {
        providers.add_scanner(uncached_core::NodeModulesScanner);
    }
    if settings.detect_cargo_target {
        providers.add_scanner(uncached_core::CargoTargetScanner);
    }
    if settings.detect_next_cache {
        providers.add_scanner(uncached_core::NextCacheScanner);
    }
    if settings.detect_turbo_cache {
        providers.add_scanner(uncached_core::TurboCacheScanner);
    }
    providers.add_scanner(uncached_core::PyCacheScanner);
    if settings.detect_gradle_cache {
        providers.add_scanner(uncached_core::GradleScanner);
    }
    providers
}

#[cfg(test)]
mod tests {
    use super::get_default_providers;
    use crate::commands::settings::AppSettings;
    use uncached_core::{Category, ProviderSet};

    fn active_categories(providers: &ProviderSet) -> Vec<Category> {
        providers.categories().collect()
    }

    #[test]
    fn default_settings_register_six_active_provider_categories() {
        let providers = get_default_providers(&AppSettings::default());
        let categories = active_categories(&providers);

        assert_eq!(
            categories,
            vec![
                Category::NodeModules,
                Category::CargoTarget,
                Category::NextJs,
                Category::Turbo,
                Category::PyCache,
                Category::Gradle,
            ]
        );
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
            assert!(providers.scanner_for(&Category::PyCache).is_some());
            assert!(
                providers.scanner_for(&removed).is_none(),
                "{name} should be removed"
            );
        }
    }
}
