//! The shapes a scan and a cleanup hand back to the commands.

use super::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStartResult {
    pub scan_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelScanResult {
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelCleanupResult {
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetSizeUpdate {
    pub scan_id: String,
    pub target_id: String,
    pub size_bytes: u64,
    pub last_used_at: Option<i64>,
    pub size_has_errors: bool,
    pub size_pending: bool,
    pub formatted_size: String,
}

#[derive(Clone)]
pub struct RegisteredTarget {
    pub target: ScanTarget,
    pub root_path: PathBuf,
    pub providers: Arc<uncached_core::ProviderSet>,
    /// The programs that own this directory, for the check at removal time.
    ///
    /// Empty for everything found by walking a workspace: a project's artifacts
    /// are guarded by the running-project check on the screen that offers them,
    /// and there is no single program that owns a `node_modules`.
    pub owner: &'static [&'static str],
}
