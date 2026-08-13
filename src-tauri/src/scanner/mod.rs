use std::path::PathBuf;

/// Drops any root contained in another, keeping the outermost. Expects canonical paths.
pub fn outermost_roots(roots: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut kept: Vec<PathBuf> = Vec::new();
    for root in roots {
        if kept.iter().any(|existing| root.starts_with(existing)) {
            continue;
        }
        kept.retain(|existing| !existing.starts_with(&root));
        kept.push(root);
    }
    kept
}

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
    // Registered unconditionally, like the Python cache above: each of these
    // requires its ecosystem's project file beside the directory, so on a
    // machine without that ecosystem they match nothing and cost nothing. A
    // toggle per provider only earns its place in the settings screen once
    // there is a reason to turn one off.
    providers.add_scanner(uncached_core::XcodeDerivedDataScanner);
    providers.add_scanner(uncached_core::SwiftBuildScanner);
    providers.add_scanner(uncached_core::DotNetObjScanner);
    providers.add_scanner(uncached_core::DartToolScanner);
    providers.with_ignore_rules(compile_ignore_rules(&settings.ignore_rules).0)
}

/// Compiles the user's rules, returning the lines that failed alongside them.
///
/// A broken line is never a reason to drop the whole list: the rules that do
/// compile still protect what they name. Callers that can show the failures —
/// the settings screen — take the second half; the scan takes the first.
pub fn compile_ignore_rules(
    text: &str,
) -> (
    uncached_core::IgnoreRules,
    Vec<uncached_core::IgnoreRuleError>,
) {
    uncached_core::IgnoreRules::compile(text, uncached_core::home_directory().as_deref())
}

#[cfg(test)]
mod tests {
    use super::{get_default_providers, outermost_roots};
    use crate::commands::settings::AppSettings;
    use std::path::PathBuf;
    use uncached_core::{Category, ProviderSet};

    fn active_categories(providers: &ProviderSet) -> Vec<Category> {
        providers.categories().collect()
    }

    fn roots(paths: &[&str]) -> Vec<PathBuf> {
        paths.iter().map(PathBuf::from).collect()
    }

    #[test]
    fn a_root_inside_another_is_dropped_whichever_order_it_arrives() {
        assert_eq!(
            outermost_roots(roots(&["/work", "/work/api"])),
            roots(&["/work"])
        );
        assert_eq!(
            outermost_roots(roots(&["/work/api", "/work"])),
            roots(&["/work"])
        );
    }

    #[test]
    fn a_shared_prefix_is_not_containment() {
        assert_eq!(
            outermost_roots(roots(&["/work", "/work-archive"])),
            roots(&["/work", "/work-archive"])
        );
    }

    #[test]
    fn a_repeated_root_is_kept_once() {
        assert_eq!(
            outermost_roots(roots(&["/work", "/work"])),
            roots(&["/work"])
        );
    }

    #[test]
    fn default_settings_register_every_provider_category() {
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
                Category::XcodeDerivedData,
                Category::SwiftBuild,
                Category::DotNetObj,
                Category::DartTool,
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

            let all = get_default_providers(&AppSettings::default()).len();
            assert_eq!(providers.len(), all - 1, "{name} provider count");
            assert_eq!(categories.len(), all - 1, "{name} active categories");
            assert!(providers.scanner_for(&Category::PyCache).is_some());
            assert!(
                providers.scanner_for(&removed).is_none(),
                "{name} should be removed"
            );
        }
    }
}
