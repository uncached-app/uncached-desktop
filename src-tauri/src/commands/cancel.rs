use crate::services::scan_service::{CancelScanResult, ScanService};

#[tauri::command]
pub async fn cancel_scan(scan_id: String) -> Result<CancelScanResult, String> {
    crate::logging::info("scan", &format!("cancel requested scanId=\"{}\"", scan_id));
    ScanService::cancel_scan(&scan_id).map_err(|error| error.to_string())
}
