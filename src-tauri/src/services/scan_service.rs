use crate::errors::{NukeError, NukeResult};
use crate::filesystem::paths::strip_extended_prefix;
use crate::models::target::ScanTarget;
use crate::scanner::get_default_providers;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

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
pub struct TargetSizeUpdate {
    pub scan_id: String,
    pub target_id: String,
    pub size_bytes: u64,
    pub size_has_errors: bool,
    pub size_pending: bool,
    pub formatted_size: String,
}

#[derive(Debug, Clone)]
pub struct RegisteredTarget {
    pub target: ScanTarget,
    pub root_path: PathBuf,
}

#[derive(Default)]
struct ScanRegistry {
    targets: HashMap<String, RegisteredTarget>,
    in_flight: HashSet<String>,
    sessions: HashMap<String, ScanSession>,
}

#[derive(Debug, Clone)]
struct ScanSession {
    cancel_token: Arc<AtomicBool>,
    cancelled: bool,
    finished: bool,
    target_ids: HashSet<String>,
}

impl ScanSession {
    fn new() -> Self {
        Self {
            cancel_token: Arc::new(AtomicBool::new(false)),
            cancelled: false,
            finished: false,
            target_ids: HashSet::new(),
        }
    }
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

fn scan_path(path: &Path) -> PathBuf {
    strip_extended_prefix(path)
}

fn providers_for_scan(
    settings: &crate::commands::settings::AppSettings,
) -> uncached_core::ProviderSet {
    get_default_providers(settings)
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

        let canonical_root = std::fs::canonicalize(root_path)?;
        let scan_root = scan_path(&canonical_root);
        let scan_id = format!(
            "scan-{}",
            NEXT_SCAN_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        let result_scan_id = scan_id.clone();
        let worker_scan_id = scan_id.clone();
        crate::logging::info(
            "scan",
            &format!(
                "start scanId=\"{}\" root=\"{}\"",
                scan_id,
                scan_root.display()
            ),
        );
        let session = ScanSession::new();
        let cancel_token = Arc::clone(&session.cancel_token);
        registry()
            .lock()
            .unwrap()
            .sessions
            .insert(scan_id.clone(), session);
        let app_handle = app.clone();
        let _ = app.emit(
            "scan:started",
            serde_json::json!({ "scanId": scan_id, "rootPath": scan_root.clone() }),
        );

        std::thread::spawn(move || {
            let started_at = Instant::now();
            let settings =
                crate::commands::settings::load_settings(&app_handle).unwrap_or_default();
            let providers = providers_for_scan(&settings);
            let target_event_handle = app_handle.clone();
            let stats = Arc::new(Mutex::new(ScanStats::default()));
            let stats_for_callback = Arc::clone(&stats);
            let registry_for_callback = Arc::clone(registry());
            let callback_scan_id = worker_scan_id.clone();
            let callback_event_scan_id = worker_scan_id.clone();
            let callback_root = canonical_root.clone();
            let callback_cancel_token = Arc::clone(&cancel_token);

            let core_cancel_token = Arc::clone(&cancel_token);
            let walk_result = uncached_core::traverse_workspace(
                &scan_root,
                &providers,
                &core_cancel_token,
                move |entry| {
                    if callback_cancel_token.load(Ordering::Acquire) {
                        return uncached_core::TraversalControl::Cancel;
                    }
                    let mut stats = stats_for_callback.lock().unwrap();
                    stats.directories_scanned += 1;

                    if let Some(category) = entry.category.clone() {
                        let core_target =
                            uncached_core::ScanTarget::new(entry.path.clone(), category, 0)
                                .with_identity(entry.identity);
                        let target = ScanTarget::from_core(&callback_scan_id, core_target);
                        if callback_cancel_token.load(Ordering::Acquire) {
                            return uncached_core::TraversalControl::Cancel;
                        }
                        stats.targets_found += 1;
                        stats.total_bytes_found =
                            stats.total_bytes_found.saturating_add(target.size_bytes);

                        let mut registry = registry_for_callback.lock().unwrap();
                        let accepted = {
                            let Some(session) = registry.sessions.get_mut(&callback_scan_id) else {
                                return uncached_core::TraversalControl::Cancel;
                            };
                            if session.cancelled || session.cancel_token.load(Ordering::Acquire) {
                                false
                            } else {
                                session.target_ids.insert(target.id.clone());
                                true
                            }
                        };
                        if !accepted {
                            return uncached_core::TraversalControl::Cancel;
                        }
                        registry.targets.insert(
                            target.id.clone(),
                            RegisteredTarget {
                                target: target.clone(),
                                root_path: callback_root.clone(),
                            },
                        );
                        drop(registry);
                        let _ = target_event_handle.emit(
                            "scan:target_found",
                            serde_json::json!({
                                "scanId": callback_event_scan_id,
                                "target": target
                            }),
                        );
                        crate::logging::info(
                            "scan",
                            &format!(
                                "target scanId=\"{}\" path=\"{}\" pending=true",
                                callback_event_scan_id,
                                target.path.display()
                            ),
                        );
                        ScanService::start_target_size(
                            &target_event_handle,
                            &callback_event_scan_id,
                            &target.id,
                            &target.path,
                        );
                        return uncached_core::TraversalControl::Prune;
                    }

                    let snapshot = serde_json::json!({
                        "scanId": callback_event_scan_id,
                        "directoriesScanned": stats.directories_scanned,
                        "targetsFound": stats.targets_found,
                        "totalBytesFound": stats.total_bytes_found
                    });
                    drop(stats);
                    let _ = target_event_handle.emit("scan:progress", snapshot);
                    uncached_core::TraversalControl::Continue
                },
            );

            match walk_result {
                Ok(uncached_core::TraversalOutcome::Cancelled) => {
                    crate::logging::info(
                        "scan",
                        &format!("cancelled scanId=\"{}\"", worker_scan_id),
                    );
                    let _ = ScanService::end_session(&worker_scan_id);
                    let _ = app_handle.emit(
                        "scan:cancelled",
                        serde_json::json!({
                            "scanId": worker_scan_id,
                            "totalTargets": 0,
                            "totalBytesFound": 0
                        }),
                    );
                    return;
                }
                Err(error) => {
                    crate::logging::warn(
                        "walker",
                        &format!("scanId=\"{}\" error=\"{}\"", worker_scan_id, error),
                    );
                    if !ScanService::end_session(&worker_scan_id) {
                        if cancel_token.load(Ordering::Acquire) {
                            let _ = app_handle.emit(
                                "scan:cancelled",
                                serde_json::json!({
                                    "scanId": worker_scan_id,
                                    "totalTargets": 0,
                                    "totalBytesFound": 0
                                }),
                            );
                        }
                        return;
                    }
                    let _ = app_handle.emit(
                        "scan:failed",
                        serde_json::json!({
                            "scanId": worker_scan_id,
                            "message": error.to_string()
                        }),
                    );
                    return;
                }
                Ok(uncached_core::TraversalOutcome::Completed) => {}
            }

            if !ScanService::end_session(&worker_scan_id) {
                if cancel_token.load(Ordering::Acquire) {
                    let _ = app_handle.emit(
                        "scan:cancelled",
                        serde_json::json!({
                            "scanId": worker_scan_id,
                            "totalTargets": 0,
                            "totalBytesFound": 0
                        }),
                    );
                }
                return;
            }
            let stats = stats.lock().unwrap();
            crate::logging::info(
                "scan",
                &format!(
                    "finished scanId=\"{}\" directories={} targets={} bytes={} durationMs={}",
                    worker_scan_id,
                    stats.directories_scanned,
                    stats.targets_found,
                    stats.total_bytes_found,
                    started_at.elapsed().as_millis()
                ),
            );
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

    pub fn get_target(target_id: &str) -> NukeResult<RegisteredTarget> {
        registry()
            .lock()
            .unwrap()
            .targets
            .get(target_id)
            .cloned()
            .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))
    }

    pub fn start_target_size(app: &AppHandle, scan_id: &str, target_id: &str, path: &Path) {
        let app = app.clone();
        let scan_id = scan_id.to_string();
        let target_id = target_id.to_string();
        let path = path.to_path_buf();
        std::thread::spawn(move || {
            let report = crate::filesystem::size::calculate_dir_size_report(&path);
            if let Some(update) = Self::apply_target_size(&target_id, report) {
                crate::logging::info(
                    "size",
                    &format!(
                        "targetPath=\"{}\" bytes={} errors={}",
                        path.display(),
                        report.bytes,
                        report.errors
                    ),
                );
                let _ = app.emit("scan:target_sized", update);
            } else {
                crate::logging::info(
                    "size",
                    &format!(
                        "discarded targetId=\"{}\" scanId=\"{}\"",
                        target_id, scan_id
                    ),
                );
            }
        });
    }

    pub fn refresh_target_size(target_id: &str) -> NukeResult<TargetSizeUpdate> {
        let registered = Self::get_target(target_id)?;
        let report = crate::filesystem::size::calculate_dir_size_report(&registered.target.path);
        Self::apply_target_size(target_id, report)
            .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))
    }

    fn apply_target_size(
        target_id: &str,
        report: crate::filesystem::size::DirSize,
    ) -> Option<TargetSizeUpdate> {
        let mut registry = registry().lock().unwrap();
        let registered = registry.targets.get_mut(target_id)?;
        registered.target.set_size(report.bytes, report.errors > 0);
        Some(TargetSizeUpdate {
            scan_id: scan_id_from_target_id(target_id),
            target_id: target_id.to_string(),
            size_bytes: registered.target.size_bytes,
            size_has_errors: registered.target.size_has_errors,
            size_pending: registered.target.size_pending,
            formatted_size: registered.target.formatted_size.clone(),
        })
    }

    pub fn cancel_scan(scan_id: &str) -> NukeResult<CancelScanResult> {
        let mut registry = registry().lock().unwrap();
        let Some(mut session) = registry.sessions.remove(scan_id) else {
            return Ok(CancelScanResult { cancelled: false });
        };
        if session.cancelled || session.finished {
            return Ok(CancelScanResult { cancelled: false });
        }

        session.cancel_token.store(true, Ordering::Release);
        session.cancelled = true;
        let target_ids = session.target_ids.drain().collect::<Vec<_>>();
        for target_id in target_ids {
            registry.in_flight.remove(&target_id);
            registry.targets.remove(&target_id);
        }

        Ok(CancelScanResult { cancelled: true })
    }

    fn end_session(scan_id: &str) -> bool {
        registry()
            .lock()
            .unwrap()
            .sessions
            .remove(scan_id)
            .is_some()
    }

    pub fn claim_target(target_id: &str) -> NukeResult<RegisteredTarget> {
        let mut registry = registry().lock().unwrap();
        if registry.in_flight.contains(target_id) {
            return Err(NukeError::PermissionDenied(
                "Target cleanup is already in progress".to_string(),
            ));
        }

        let target = registry
            .targets
            .get(target_id)
            .cloned()
            .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))?;
        if target.target.size_pending || target.target.size_has_errors {
            return Err(NukeError::PermissionDenied(
                "Target size is not ready".to_string(),
            ));
        }
        registry.in_flight.insert(target_id.to_string());
        Ok(target)
    }

    pub fn release_target(target_id: &str) {
        registry().lock().unwrap().in_flight.remove(target_id);
    }

    pub fn remove_target(target_id: &str) -> NukeResult<RegisteredTarget> {
        let mut registry = registry().lock().unwrap();
        registry.in_flight.remove(target_id);
        registry
            .targets
            .remove(target_id)
            .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))
    }
}

fn scan_id_from_target_id(target_id: &str) -> String {
    let mut parts = target_id.splitn(3, '-');
    match (parts.next(), parts.next()) {
        (Some("scan"), Some(number)) => format!("scan-{number}"),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::{providers_for_scan, registry, RegisteredTarget, ScanService, ScanStartResult};
    use crate::commands::settings::AppSettings;
    use crate::models::action::CleanMode;
    use crate::models::category::Category;
    use crate::models::target::ScanTarget;
    use crate::services::clean_service::CleanService;
    use std::path::PathBuf;

    #[test]
    fn converts_core_target_preserving_scan_fields_and_pending_state() {
        let identity = Some(uncached_core::FileIdentity {
            first: 17,
            second: 29,
        });
        let categories = [
            (uncached_core::Category::NodeModules, Category::NodeModules),
            (uncached_core::Category::CargoTarget, Category::CargoTarget),
            (uncached_core::Category::NextJs, Category::NextJs),
            (uncached_core::Category::Turbo, Category::Turbo),
            (uncached_core::Category::PyCache, Category::PyCache),
            (uncached_core::Category::Gradle, Category::Gradle),
        ];

        for (index, (core_category, ui_category)) in categories.into_iter().enumerate() {
            let path = PathBuf::from(format!(r"C:\workspace\target-{index}"));
            let core_target = uncached_core::ScanTarget::new(path.clone(), core_category, 4096)
                .with_identity(identity);

            let target = ScanTarget::from_core("scan-1", core_target);

            assert_eq!(target.path, path);
            assert_eq!(target.category, ui_category);
            assert_eq!(target.size_bytes, 4096);
            assert_eq!(target.identity, identity);
            assert!(target.size_pending);
        }
    }

    #[test]
    fn scan_providers_use_configured_settings_not_free_provider_set() {
        let providers = providers_for_scan(&AppSettings::default());

        assert_eq!(providers.len(), 6);
        assert!(providers
            .scanner_for(uncached_core::Category::CargoTarget)
            .is_some());
        assert!(providers
            .scanner_for(uncached_core::Category::NodeModules)
            .is_some());
        assert!(uncached_core::ProviderSet::free()
            .scanner_for(uncached_core::Category::CargoTarget)
            .is_none());
    }

    #[test]
    fn scan_path_removes_extended_prefix() {
        assert_eq!(
            super::scan_path(std::path::Path::new(r"\\?\D:\Downloads\project")),
            PathBuf::from(r"D:\Downloads\project")
        );
    }

    #[test]
    fn serializes_scan_id_as_camel_case() {
        let result = ScanStartResult {
            scan_id: "scan-1".to_string(),
        };
        let value = serde_json::to_value(result).unwrap();
        assert_eq!(value["scanId"], "scan-1");
        assert!(value.get("scan_id").is_none());
    }

    #[test]
    fn reading_target_does_not_consume_authorization() {
        let target_id = format!("test-target-{}", std::process::id());
        let target = ScanTarget::new(
            PathBuf::from("C:\\workspace\\node_modules"),
            Category::NodeModules,
            1,
            false,
            None,
        );
        registry().lock().unwrap().targets.insert(
            target_id.clone(),
            RegisteredTarget {
                target,
                root_path: PathBuf::from("C:\\workspace"),
            },
        );

        let first = ScanService::get_target(&target_id).unwrap();
        let second = ScanService::get_target(&target_id).unwrap();
        assert_eq!(first.target.path, second.target.path);

        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn claim_blocks_duplicate_cleanup_and_release_allows_retry() {
        let target_id = format!("claim-target-{}", std::process::id());
        let target = ScanTarget::new(
            PathBuf::from("C:\\workspace\\node_modules"),
            Category::NodeModules,
            1,
            false,
            None,
        );
        registry().lock().unwrap().targets.insert(
            target_id.clone(),
            RegisteredTarget {
                target,
                root_path: PathBuf::from("C:\\workspace"),
            },
        );

        ScanService::claim_target(&target_id).unwrap();
        assert!(ScanService::claim_target(&target_id).is_err());
        ScanService::release_target(&target_id);
        ScanService::claim_target(&target_id).unwrap();
        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn failed_cleanup_can_be_retried_with_same_target() {
        let target_id = format!("failed-clean-target-{}", std::process::id());
        let target = ScanTarget::new(
            PathBuf::from("C:\\workspace\\missing-node_modules"),
            Category::NodeModules,
            1,
            false,
            None,
        );
        registry().lock().unwrap().targets.insert(
            target_id.clone(),
            RegisteredTarget {
                target,
                root_path: PathBuf::from("C:\\workspace"),
            },
        );

        let registered = ScanService::claim_target(&target_id).unwrap();
        assert!(CleanService::clean_registered_target(
            registered,
            Some(&crate::commands::settings::AppSettings::default()),
            CleanMode::Trash,
            None,
        )
        .is_err());
        ScanService::release_target(&target_id);
        assert!(ScanService::get_target(&target_id).is_ok());
        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn cancelling_session_removes_targets_and_is_idempotent() {
        let scan_id = format!("cancel-scan-{}", std::process::id());
        let target_id = format!("{scan_id}-target");
        let target = ScanTarget::new(
            PathBuf::from("C:\\workspace\\node_modules"),
            Category::NodeModules,
            1,
            false,
            None,
        );
        let mut registry = registry().lock().unwrap();
        registry
            .sessions
            .insert(scan_id.clone(), super::ScanSession::new());
        registry.targets.insert(
            target_id.clone(),
            RegisteredTarget {
                target,
                root_path: PathBuf::from("C:\\workspace"),
            },
        );
        registry
            .sessions
            .get_mut(&scan_id)
            .unwrap()
            .target_ids
            .insert(target_id.clone());
        drop(registry);

        assert!(ScanService::cancel_scan(&scan_id).unwrap().cancelled);
        assert!(ScanService::get_target(&target_id).is_err());
        assert!(ScanService::claim_target(&target_id).is_err());
        assert!(!ScanService::cancel_scan(&scan_id).unwrap().cancelled);
    }

    #[test]
    fn serializes_cancel_result() {
        let result = super::CancelScanResult { cancelled: true };
        let value = serde_json::to_value(result).unwrap();
        assert_eq!(value["cancelled"], true);
    }

    #[test]
    fn ending_session_removes_terminal_state() {
        let scan_id = format!("finished-scan-{}", std::process::id());
        registry()
            .lock()
            .unwrap()
            .sessions
            .insert(scan_id.clone(), super::ScanSession::new());

        assert!(ScanService::end_session(&scan_id));
        assert!(!ScanService::end_session(&scan_id));
        assert!(!ScanService::cancel_scan(&scan_id).unwrap().cancelled);
    }
}
