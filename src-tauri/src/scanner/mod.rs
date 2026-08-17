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
    use uncached_core::Scanner as _;

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
        // Composer's is replaced rather than dropped: see `composer()` below.
        if scanner.category() == uncached_core::Category::ComposerVendor {
            continue;
        }
        providers.add_scanner(scanner);
    }
    providers.add_scanner(composer());
    providers.with_ignore_rules(compile_ignore_rules(&settings.ignore_rules).0)
}

/// Composer's `vendor`, confirmed by a project that could put it back.
///
/// The catalogue's own version asks only for a `composer.json` beside the
/// directory, and that is not what a `composer.json` means in PHP. Libraries
/// ship one so their autoloader can be read, and anything that bundles a
/// library ships the library — so a WordPress plugin arrives on disk carrying
/// other people's package trees, each with a manifest, each looking from the
/// outside exactly like a project root. One of them was offered as reclaimable:
///
///   wp-content/plugins/fluent-smtp/includes/libs/google-api-client/build/vendor
///
/// Nothing there can regenerate it. There is no lock file to install from and
/// no repository to restore from; the tree is the shipped artifact, and
/// removing it breaks the plugin until the site owner reinstalls it by hand.
///
/// So the marker asks the question the category is actually about — can this be
/// put back — and answers it from two things that only a project has.
fn composer() -> uncached_core::ProjectScanner {
    uncached_core::ProjectScanner::new(
        uncached_core::Category::ComposerVendor,
        &["vendor"],
        uncached_core::ProjectMarker::Custom(is_restorable_composer_project),
    )
}

fn is_restorable_composer_project(root: &std::path::Path) -> bool {
    if !root.join("composer.json").is_file() {
        return false;
    }
    if is_bundled_in_wordpress_extension(root) {
        return false;
    }
    // A lock file is what `composer install` restores from. Failing that, a
    // repository is the sign this is somebody's own project rather than a copy
    // of somebody else's — a library checkout keeps its lock out of version
    // control, and that is the case this second test exists for.
    root.join("composer.lock").is_file() || root.join(".git").exists()
}

/// Whether this sits *below* the root of a WordPress plugin or theme.
///
/// The extension's own root is not bundled — a plugin somebody is writing is a
/// project like any other, and the test above still asks it for a lock or a
/// repository. Everything deeper is code that arrived with it.
fn is_bundled_in_wordpress_extension(root: &std::path::Path) -> bool {
    let components: Vec<_> = root.components().collect();
    components
        .iter()
        .position(|component| component.as_os_str() == "wp-content")
        .and_then(|index| {
            let kind = components.get(index + 1)?.as_os_str();
            if !matches!(
                kind.to_str()?,
                "plugins" | "themes" | "mu-plugins" | "client-mu-plugins"
            ) {
                return None;
            }
            // `index + 2` is the extension itself; anything past it is inside.
            Some(components.len() > index + 3)
        })
        .unwrap_or(false)
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
    // Xcode's own directories: DerivedData, device support, the simulator
    // store. This used to be added unconditionally on the grounds that it
    // follows the workspace rather than a preference — but two of its entries
    // can only be reported and never removed, and a row somebody can neither
    // act on nor switch off is noise they are stuck with.
    if settings.detect_xcode_data {
        categories.push(uncached_core::Category::XcodeDerivedData);
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
    use super::{get_default_providers, is_bundled_in_wordpress_extension, outermost_roots};
    use crate::commands::settings::AppSettings;
    use std::path::{Path, PathBuf};
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
    fn only_what_a_plugin_ships_counts_as_bundled() {
        assert!(is_bundled_in_wordpress_extension(Path::new(
            "/w/wordpress/site/wp-content/plugins/fluent-smtp/includes/libs/google-api-client/build"
        )));
        assert!(is_bundled_in_wordpress_extension(Path::new(
            "/w/wp-content/themes/storefront/vendor/acme/widget"
        )));
        // The extension's own root is a project, and is asked for a lock or a
        // repository like any other.
        assert!(!is_bundled_in_wordpress_extension(Path::new(
            "/w/wp-content/plugins/fluent-smtp"
        )));
        // `wp-content` alone decides nothing; the directory under it does.
        assert!(!is_bundled_in_wordpress_extension(Path::new(
            "/w/wp-content/uploads/a/b/c"
        )));
        assert!(!is_bundled_in_wordpress_extension(Path::new(
            "/w/api/src/vendor-tools/deep"
        )));
    }

    #[test]
    fn a_composer_root_needs_a_way_to_put_vendor_back() {
        let root = std::env::temp_dir().join(format!("uncached-composer-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        // A manifest on its own is what a bundled library ships.
        std::fs::write(root.join("composer.json"), "{}").unwrap();
        assert!(!super::is_restorable_composer_project(&root));

        std::fs::write(root.join("composer.lock"), "{}").unwrap();
        assert!(super::is_restorable_composer_project(&root));

        // A checkout that keeps its lock out of version control still has the
        // repository, which is the other way back.
        std::fs::remove_file(root.join("composer.lock")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        assert!(super::is_restorable_composer_project(&root));

        let _ = std::fs::remove_dir_all(&root);
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
    fn every_discovery_category_has_a_switch_that_reaches_it() {
        use uncached_core::Category as C;
        let all = super::discovery_categories(&AppSettings::default());
        assert!(all.contains(&C::PackageManagerCache));
        assert!(all.contains(&C::AiToolCache));
        assert!(all.contains(&C::EditorCache));
        assert!(all.contains(&C::XcodeDerivedData));

        let reduced = super::discovery_categories(&AppSettings {
            detect_ai_tool_caches: false,
            ..Default::default()
        });
        assert!(!reduced.contains(&C::AiToolCache));

        // Xcode used to be added whatever the settings said, described under
        // the editor caches switch and unaffected by it. Two of its entries can
        // only ever be reported, so that left rows nobody could act on or turn
        // off — the shape of thing this assertion exists to stop coming back.
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
