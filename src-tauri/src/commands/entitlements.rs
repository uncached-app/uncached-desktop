use crate::entitlements::{current_status, EntitlementStatus};

#[tauri::command]
pub fn get_entitlement_status() -> EntitlementStatus {
    current_status()
}
