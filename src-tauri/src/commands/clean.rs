use crate::models::action::{CleanRequest, CleanResult};
use crate::services::clean_flow::perform_clean;
use crate::services::scan_service::platform;
use tauri::AppHandle;

#[tauri::command]
pub fn cleanup_capabilities(
) -> uncached_core::contract::v1::ApiEnvelope<uncached_core::contract::v1::CleanupCapabilities> {
    uncached_core::contract::v1::ApiEnvelope::success(
        platform(),
        uncached_core::cleanup_capabilities(),
    )
}

#[tauri::command]
pub async fn clean_target(
    app: AppHandle,
    request: CleanRequest,
) -> uncached_core::contract::v1::ApiEnvelope<CleanResult> {
    perform_clean(&app, request).await
}

#[cfg(test)]
mod tests {
    use super::{cleanup_capabilities, platform};

    #[test]
    fn cleanup_capabilities_preserve_core_runtime_probe() {
        let envelope = cleanup_capabilities();
        let capabilities = uncached_core::cleanup_capabilities();
        let value = serde_json::to_value(envelope).unwrap();

        assert_eq!(value["platform"], serde_json::to_value(platform()).unwrap());
        assert_eq!(value["data"], serde_json::to_value(&capabilities).unwrap());
        assert!(value["error"].is_null());
        if !cfg!(any(windows, unix)) {
            assert!(!capabilities.move_to_trash);
        }
    }
}
