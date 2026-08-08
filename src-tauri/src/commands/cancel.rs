use crate::services::scan_service::{CancelCleanupResult, CancelScanResult, ScanService};

#[tauri::command]
pub async fn cancel_scan(scan_id: String) -> Result<CancelScanResult, String> {
    crate::logging::info("scan", &format!("cancel requested scanId=\"{}\"", scan_id));
    ScanService::cancel_scan(&scan_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn cancel_cleanup(target_id: String) -> Result<CancelCleanupResult, String> {
    ScanService::cancel_cleanup(&target_id).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::CancelCleanupResult;

    #[test]
    fn cancel_cleanup_result_serializes_as_cancelled() {
        let value = serde_json::to_value(CancelCleanupResult { cancelled: true }).unwrap();

        assert_eq!(value, serde_json::json!({ "cancelled": true }));
    }
}
