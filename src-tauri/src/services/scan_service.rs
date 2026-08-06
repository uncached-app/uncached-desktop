use crate::errors::{NukeError, NukeResult};
use crate::filesystem::walker::DiskWalker;
use crate::models::target::ScanTarget;
use crate::scanner::get_default_scanners;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStartResult {
    pub scan_id: String,
}

#[derive(Debug, Clone)]
pub struct RegisteredTarget {
    pub target: ScanTarget,
    pub root_path: PathBuf,
}

#[derive(Default)]
struct ScanRegistry {
    targets: HashMap<String, RegisteredTarget>,
}

#[derive(Default)]
struct ScanStats {
    directories_scanned: u64,
    targets_found: u64,
    total_bytes_found: u64,
}

static REGISTRY: OnceLock<Arc<Mutex<ScanRegistry>>> = OnceLock::new();
static NEXT_SCAN_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

fn registry() -> &'static Arc<Mutex<ScanRegistry>> {
    REGISTRY.get_or_init(|| Arc::new(Mutex::new(ScanRegistry::default())))
}

pub struct ScanService;

impl ScanService {
    pub fn start_scan(app: &AppHandle, root_path: &Path) -> NukeResult<ScanStartResult> {
        let metadata = std::fs::symlink_metadata(root_path)
            .map_err(|_| NukeError::NotFound(root_path.display().to_string()))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(NukeError::PermissionDenied(
                "Scan root must be a real directory".to_string(),
            ));
        }

        let root = std::fs::canonicalize(root_path)?;
        let scan_id = format!(
            "scan-{}",
            NEXT_SCAN_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        let result_scan_id = scan_id.clone();
        let worker_scan_id = scan_id.clone();
        let app_handle = app.clone();
        let event_scan_id = scan_id.clone();

        std::thread::spawn(move || {
            let started_at = Instant::now();
            let _ = app_handle.emit(
                "scan:started",
                serde_json::json!({ "scanId": event_scan_id, "rootPath": root }),
            );

            let scanners = get_default_scanners();
            let target_event_handle = app_handle.clone();
            let stats = Arc::new(Mutex::new(ScanStats::default()));
            let stats_for_callback = Arc::clone(&stats);
            let registry_for_callback = Arc::clone(registry());
            let callback_scan_id = worker_scan_id.clone();
            let callback_event_scan_id = worker_scan_id.clone();
            let callback_root = root.clone();

            DiskWalker::walk_directories(&root, move |dir_path, dir_name| {
                let mut stats = stats_for_callback.lock().unwrap();
                stats.directories_scanned += 1;

                for scanner in &scanners {
                    if scanner.matches(dir_name) {
                        if let Some(mut target) = scanner.create_target(dir_path) {
                            target.id = format!("{}-{}", callback_scan_id, target.id);
                            stats.targets_found += 1;
                            stats.total_bytes_found =
                                stats.total_bytes_found.saturating_add(target.size_bytes);

                            registry_for_callback.lock().unwrap().targets.insert(
                                target.id.clone(),
                                RegisteredTarget {
                                    target: target.clone(),
                                    root_path: callback_root.clone(),
                                },
                            );
                            let _ = target_event_handle.emit(
                                "scan:target_found",
                                serde_json::json!({
                                    "scanId": callback_event_scan_id,
                                    "target": target
                                }),
                            );
                            return true;
                        }
                    }
                }

                let snapshot = serde_json::json!({
                    "scanId": callback_event_scan_id,
                    "directoriesScanned": stats.directories_scanned,
                    "targetsFound": stats.targets_found,
                    "totalBytesFound": stats.total_bytes_found
                });
                drop(stats);
                let _ = target_event_handle.emit("scan:progress", snapshot);
                false
            });

            let stats = stats.lock().unwrap();
            let _ = app_handle.emit(
                "scan:finished",
                serde_json::json!({
                    "scanId": worker_scan_id,
                    "totalTargets": stats.targets_found,
                    "totalBytesFound": stats.total_bytes_found,
                    "durationMs": started_at.elapsed().as_millis()
                }),
            );
        });

        Ok(ScanStartResult {
            scan_id: result_scan_id,
        })
    }

    pub fn take_target(target_id: &str) -> NukeResult<RegisteredTarget> {
        registry()
            .lock()
            .unwrap()
            .targets
            .remove(target_id)
            .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))
    }
}

#[cfg(test)]
mod tests {
    use super::ScanStartResult;

    #[test]
    fn serializes_scan_id_as_camel_case() {
        let result = ScanStartResult {
            scan_id: "scan-1".to_string(),
        };
        let value = serde_json::to_value(result).unwrap();
        assert_eq!(value["scanId"], "scan-1");
        assert!(value.get("scan_id").is_none());
    }
}
