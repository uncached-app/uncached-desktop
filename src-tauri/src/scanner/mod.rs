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
    settings: &crate::settings::AppSettings,
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
    settings: &crate::settings::AppSettings,
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
    // Xcode's own directories: DerivedData, device support, the simulator
    // store. This used to be added unconditionally on the grounds that it
    // follows the workspace rather than a preference — but two of its entries
    // can only be reported and never removed, and a row somebody can neither
    // act on nor switch off is noise they are stuck with.
    if settings.detect_xcode_data {
        categories.push(uncached_core::Category::XcodeDerivedData);
    }
    // A game engine's own caches, which are nowhere near its projects: Unity's
    // package and Asset Store downloads, Godot's editor cache and the export
    // templates it fetches per version.
    if settings.detect_game_engine_caches {
        categories.push(uncached_core::Category::UnityLibrary);
        categories.push(uncached_core::Category::GodotCache);
    }
    if settings.detect_android_sdk {
        categories.push(uncached_core::Category::AndroidSdk);
    }
    if settings.detect_browser_caches {
        categories.push(uncached_core::Category::BrowserCache);
    }
    // Docker's image is reported and never removed, so this switch decides
    // whether the weight is named at all rather than what may be touched.
    if settings.detect_container_storage {
        categories.push(uncached_core::Category::Docker);
    }
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
    use crate::settings::AppSettings;
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

    /// The path that produced this rule, and the three around it that must not
    /// be caught by it.
    #[test]
    fn every_workspace_provider_is_registered() {
        let categories = active_categories(&get_default_providers(&AppSettings::default()));

        assert_eq!(
            categories.first(),
            Some(&Category::ReactNative),
            "claims nested paths first"
        );
        assert_eq!(categories.len(), 31);
        for expected in [
            Category::NodeModules,
            Category::CargoTarget,
            Category::PyCache,
            Category::UnityLibrary,
            Category::ComposerVendor,
            Category::JsBuildCache,
            Category::ServerlessBuild,
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
                crate::entitlements::is_free_category(&category),
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
    fn every_discovery_category_has_a_switch_that_reaches_it() {
        use uncached_core::Category as C;
        let all = super::discovery_categories(&AppSettings::default());
        assert!(all.contains(&C::PackageManagerCache));
        assert!(all.contains(&C::AiToolCache));
        assert!(all.contains(&C::EditorCache));
        assert!(all.contains(&C::XcodeDerivedData));
        assert!(all.contains(&C::UnityLibrary));
        assert!(all.contains(&C::GodotCache));
        assert!(all.contains(&C::AndroidSdk));
        assert!(all.contains(&C::BrowserCache));
        assert!(all.contains(&C::Docker));

        let reduced = super::discovery_categories(&AppSettings {
            detect_ai_tool_caches: false,
            ..Default::default()
        });
        assert!(!reduced.contains(&C::AiToolCache));

        let no_browsers = super::discovery_categories(&AppSettings {
            detect_browser_caches: false,
            ..Default::default()
        });
        assert!(!no_browsers.contains(&C::BrowserCache));
        assert!(no_browsers.contains(&C::EditorCache));

        // Xcode used to be added whatever the settings said, described under
        // the editor caches switch and unaffected by it. Two of its entries can
        // only ever be reported, so that left rows nobody could act on or turn
        // off — the shape of thing this assertion exists to stop coming back.
        // A catalogued location reaches the scan through its category, so an
        // engine's global caches are only ever as switchable as the category
        // they arrive under.
        let no_engines = super::discovery_categories(&AppSettings {
            detect_game_engine_caches: false,
            ..Default::default()
        });
        assert!(!no_engines.contains(&C::UnityLibrary));
        assert!(!no_engines.contains(&C::GodotCache));

        let no_xcode = super::discovery_categories(&AppSettings {
            detect_xcode_data: false,
            ..Default::default()
        });
        assert!(!no_xcode.contains(&C::XcodeDerivedData));
        assert!(
            no_xcode.contains(&C::EditorCache),
            "one switch, one category"
        );
    }
}
