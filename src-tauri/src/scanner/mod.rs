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

/// Every workspace provider, always.
///
/// The five toggles that used to gate some of these are gone. An ignore rule
/// says "never touch anything called this, anywhere", applies to all thirty
/// categories rather than five, and wins against the provider, the confidence
/// and a schedule — so a switch beside it was a weaker duplicate of a mechanism
/// the user already had.
///
/// React Native is registered first: it claims paths inside `ios/` and
/// `android/` that the platform tooling would otherwise claim by their bare
/// names, and the first provider to confirm wins.
pub fn get_default_providers(
    settings: &crate::commands::settings::AppSettings,
) -> uncached_core::ProviderSet {
    let mut providers = uncached_core::ProviderSet::new();
    providers.add_scanner(uncached_core::ecosystems::react_native());
    providers.add_scanner(uncached_core::NodeModulesScanner);
    providers.add_scanner(uncached_core::CargoTargetScanner);
    providers.add_scanner(uncached_core::NextCacheScanner);
    providers.add_scanner(uncached_core::TurboCacheScanner);
    providers.add_scanner(uncached_core::PyCacheScanner);
    providers.add_scanner(uncached_core::GradleScanner);
    providers.add_scanner(uncached_core::XcodeDerivedDataScanner);
    providers.add_scanner(uncached_core::SwiftBuildScanner);
    providers.add_scanner(uncached_core::DotNetObjScanner);
    providers.add_scanner(uncached_core::DartToolScanner);
    for scanner in uncached_core::ecosystems::all() {
        providers.add_scanner(scanner);
    }
    providers.with_ignore_rules(compile_ignore_rules(&settings.ignore_rules).0)
}

/// The catalogued categories the user still wants looked at.
///
/// Unlike the workspace, these live under paths nobody chose and belong to
/// tools rather than to projects, so each is its own decision.
pub fn discovery_categories(
    settings: &crate::commands::settings::AppSettings,
) -> Vec<uncached_core::Category> {
    let mut categories = Vec::new();
    if settings.detect_package_manager_caches {
        categories.push(uncached_core::Category::PackageManagerCache);
    }
    if settings.detect_ai_tool_caches {
        categories.push(uncached_core::Category::AiToolCache);
    }
    if settings.detect_editor_caches {
        categories.push(uncached_core::Category::EditorCache);
    }
    // Xcode's developer data is reached by the same probe but is not a tool
    // cache the user opted into: it is the same category the workspace walk
    // reports, and it follows the workspace rather than these switches.
    categories.push(uncached_core::Category::XcodeDerivedData);
    categories
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
    fn every_workspace_provider_is_registered() {
        let categories = active_categories(&get_default_providers(&AppSettings::default()));

        assert_eq!(
            categories.first(),
            Some(&Category::ReactNative),
            "claims nested paths first"
        );
        assert_eq!(categories.len(), 29);
        for expected in [
            Category::NodeModules,
            Category::CargoTarget,
            Category::PyCache,
            Category::UnityLibrary,
            Category::ComposerVendor,
        ] {
            assert!(
                categories.contains(&expected),
                "{expected:?} must be registered"
            );
        }
    }

    /// The rule `PRODUCT.md` states as a brand commitment, defended where it
    /// can actually be broken: nothing found by walking a folder the user chose
    /// is ever behind the paywall. Free reclaims every artifact of every
    /// project, and what Pro adds lives outside the workspace — the catalogued
    /// tool caches, which `discovery_categories` gathers separately.
    ///
    /// `Footprint` used to carry a `free_reclaimable_bytes` beside its total,
    /// summing the categories a Free plan could act on. Because of this
    /// invariant the two figures were always equal, so the field described a
    /// boundary that does not exist inside a project and no screen ever read
    /// it. Asserting the invariant is worth more than carrying the field: add a
    /// paid category to the workspace walk and this fails, which is the moment
    /// the decision deserves to be made again rather than silently.
    #[test]
    fn nothing_inside_a_chosen_folder_is_behind_the_paywall() {
        for category in active_categories(&get_default_providers(&AppSettings::default())) {
            assert!(
                crate::commands::entitlements::is_free_category(&category),
                "{category:?} is found by the workspace walk and would be charged for"
            );
        }
    }

    /// The five detection toggles are gone on purpose. An ignore rule reaches
    /// every category rather than five, and it wins in more places, so a switch
    /// beside it would have been a weaker duplicate.
    #[test]
    fn a_workspace_provider_is_never_switched_off_by_settings() {
        let bare = active_categories(&get_default_providers(&AppSettings {
            ignore_rules: String::new(),
            ..Default::default()
        }))
        .len();

        let switched_off = AppSettings {
            ignore_rules: String::new(),
            detect_package_manager_caches: false,
            detect_ai_tool_caches: false,
            detect_editor_caches: false,
            ..Default::default()
        };

        assert_eq!(
            active_categories(&get_default_providers(&switched_off)).len(),
            bare,
            "the discovery switches never touch the workspace walk"
        );
    }

    #[test]
    fn discovery_follows_its_switches_and_xcode_follows_the_workspace() {
        use uncached_core::Category as C;
        let all = super::discovery_categories(&AppSettings::default());
        assert!(all.contains(&C::PackageManagerCache));
        assert!(all.contains(&C::AiToolCache));
        assert!(all.contains(&C::EditorCache));

        let reduced = super::discovery_categories(&AppSettings {
            detect_ai_tool_caches: false,
            ..Default::default()
        });
        assert!(!reduced.contains(&C::AiToolCache));
        assert!(
            reduced.contains(&C::XcodeDerivedData),
            "Xcode data is the workspace's category, not a tool cache switch"
        );
    }
}
