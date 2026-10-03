use crate::models::category::Category;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EntitlementStatus {
    pub plan: Plan,
    pub pro_enabled: bool,
}

/// The plan a category requires. This is the single definition of the Free
/// boundary: the cleanup gate and the plan stamped on every scan target both
/// read it, so what the UI shows can never drift from what the native layer
/// allows.
///
/// The boundary is drawn around what the artifact belongs to, not around how
/// much it weighs. Anything a project can regenerate from its own build is
/// Free, in every ecosystem — that is the job, and charging for a subset of it
/// would make the product worse at the one thing it claims to do.
///
/// What stays Pro is what is not a project artifact: the machine-wide stores a
/// tool shares across every project, where emptying them slows down every
/// future restore rather than reclaiming a build output.
///
/// `Docker` is deliberately absent. It exists in the category model with no
/// scanner behind it, and pricing a capability that finds nothing is the one
/// thing a paywall must never do. It moves back beside the other shared stores
/// on the day a provider makes it real, not before.
pub fn plan_for_category(category: &Category) -> Plan {
    match category {
        Category::PackageManagerCache
        | Category::AiToolCache
        | Category::EditorCache
        | Category::Custom(_) => Plan::Pro,
        _ => Plan::Free,
    }
}

/// Workspace roots a plan may scan or index at once.
pub fn root_limit() -> usize {
    if current_status().pro_enabled {
        MAX_ROOTS
    } else {
        1
    }
}

const MAX_ROOTS: usize = 12;

pub fn is_free_category(category: &Category) -> bool {
    plan_for_category(category) == Plan::Free
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Plan {
    Free,
    Pro,
}

impl Default for EntitlementStatus {
    fn default() -> Self {
        Self {
            plan: Plan::Free,
            pro_enabled: false,
        }
    }
}

/// The plan this process is running under.
///
/// Read from the verified licence rather than from anything the UI can set: the
/// frontend is told what the plan is and never the other way round. The default
/// stays closed, so a licence that fails to verify — or a build with no signing
/// key — leaves the app on Free instead of open.
pub fn current_status() -> EntitlementStatus {
    if cfg!(debug_assertions) && std::env::var_os("UNCACHED_DEV_PRO").is_some() {
        return EntitlementStatus {
            plan: Plan::Pro,
            pro_enabled: true,
        };
    }
    if crate::license::active_license().is_some() {
        return EntitlementStatus {
            plan: Plan::Pro,
            pro_enabled: true,
        };
    }
    EntitlementStatus::default()
}

#[cfg(test)]
mod tests {
    use super::{current_status, is_free_category, plan_for_category, root_limit, Plan, MAX_ROOTS};
    use crate::models::category::Category;

    #[test]
    fn the_root_limit_follows_the_plan_and_is_never_zero() {
        let expected = if current_status().pro_enabled {
            MAX_ROOTS
        } else {
            1
        };
        assert_eq!(root_limit(), expected);
        assert!(root_limit() >= 1);
    }

    #[test]
    fn entitlement_defaults_to_free_without_dev_override() {
        std::env::remove_var("UNCACHED_DEV_PRO");
        let status = current_status();
        assert_eq!(status.plan, Plan::Free);
        assert!(!status.pro_enabled);
    }

    #[test]
    fn every_project_artifact_is_free_whatever_ecosystem_wrote_it() {
        for category in [
            Category::NodeModules,
            Category::CargoTarget,
            Category::NextJs,
            Category::Turbo,
            Category::DotNetObj,
            Category::PyCache,
            Category::Gradle,
            Category::GradleBuild,
            Category::MavenTarget,
            Category::SbtTarget,
            Category::CMakeBuild,
            Category::UnityLibrary,
            Category::UnrealIntermediate,
            Category::GodotCache,
            Category::ElixirBuild,
            Category::HaskellBuild,
            Category::ZigCache,
            Category::FlutterBuild,
            Category::DartTool,
            Category::SwiftBuild,
            Category::XcodeDerivedData,
            Category::JupyterCheckpoints,
            Category::PixiEnv,
            Category::ComposerVendor,
            Category::TerraformDir,
            Category::CocoapodsPods,
            Category::ReactNative,
            Category::NuxtCache,
            Category::SvelteKitCache,
        ] {
            assert_eq!(
                plan_for_category(&category),
                Plan::Free,
                "{category:?} is a project artifact and must be free"
            );
            assert!(is_free_category(&category));
        }
    }

    #[test]
    fn what_is_shared_across_every_project_is_not_a_project_artifact() {
        for category in [
            Category::PackageManagerCache,
            Category::AiToolCache,
            Category::EditorCache,
            Category::Custom("anything".to_string()),
        ] {
            assert_eq!(plan_for_category(&category), Plan::Pro);
            assert!(!is_free_category(&category));
        }
    }

    /// A category with no scanner behind it finds nothing, and a plan that
    /// charges for nothing is worse than one that charges for too little. This
    /// stays here until a Docker provider exists — at which point the failure is
    /// the reminder to price it.
    #[test]
    fn a_category_no_scanner_can_find_is_not_sold() {
        assert_eq!(plan_for_category(&Category::Docker), Plan::Free);
        assert!(is_free_category(&Category::Docker));
    }

    #[test]
    fn plan_serializes_as_the_lowercase_wire_form() {
        let value = serde_json::to_value(plan_for_category(&Category::NodeModules)).unwrap();
        assert_eq!(value, "free");
        let value = serde_json::to_value(plan_for_category(&Category::EditorCache)).unwrap();
        assert_eq!(value, "pro");
    }
}
