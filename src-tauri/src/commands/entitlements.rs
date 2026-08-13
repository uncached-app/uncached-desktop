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
pub fn plan_for_category(category: &Category) -> Plan {
    match category {
        Category::NodeModules => Plan::Free,
        _ => Plan::Pro,
    }
}

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

// Billing and signed license verification will populate this boundary later.
// Keeping the default closed prevents a client-side flag from unlocking cleanup.
pub fn current_status() -> EntitlementStatus {
    if cfg!(debug_assertions) && std::env::var_os("UNCACHED_DEV_PRO").is_some() {
        return EntitlementStatus {
            plan: Plan::Pro,
            pro_enabled: true,
        };
    }
    EntitlementStatus::default()
}

#[tauri::command]
pub fn get_entitlement_status() -> EntitlementStatus {
    current_status()
}

#[cfg(test)]
mod tests {
    use super::{current_status, is_free_category, plan_for_category, Plan};
    use crate::models::category::Category;

    #[test]
    fn entitlement_defaults_to_free_without_dev_override() {
        std::env::remove_var("UNCACHED_DEV_PRO");
        let status = current_status();
        assert_eq!(status.plan, Plan::Free);
        assert!(!status.pro_enabled);
    }

    #[test]
    fn only_node_modules_is_free() {
        assert_eq!(plan_for_category(&Category::NodeModules), Plan::Free);
        assert!(is_free_category(&Category::NodeModules));

        for category in [
            Category::CargoTarget,
            Category::NextJs,
            Category::Turbo,
            Category::DotNetObj,
            Category::PyCache,
            Category::Gradle,
            Category::Docker,
            Category::Custom("anything".to_string()),
        ] {
            assert_eq!(plan_for_category(&category), Plan::Pro);
            assert!(!is_free_category(&category));
        }
    }

    #[test]
    fn plan_serializes_as_the_lowercase_wire_form() {
        let value = serde_json::to_value(plan_for_category(&Category::NodeModules)).unwrap();
        assert_eq!(value, "free");
        let value = serde_json::to_value(plan_for_category(&Category::Docker)).unwrap();
        assert_eq!(value, "pro");
    }
}
