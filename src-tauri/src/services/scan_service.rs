use crate::errors::{NukeError, NukeResult};
use crate::filesystem::paths::strip_extended_prefix;
use crate::models::target::ScanTarget;
use crate::scanner::get_default_providers;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
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
pub struct CancelCleanupResult {
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

#[derive(Clone)]
pub struct RegisteredTarget {
    pub target: ScanTarget,
    pub root_path: PathBuf,
    pub providers: Arc<uncached_core::ProviderSet>,
}

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq)]
enum CleanupPhase {
    Preparing = 0,
    Executing = 1,
    Finished = 2,
    Cancelled = 3,
}

pub struct CleanupControl {
    phase: AtomicU8,
    cancel_requested: AtomicBool,
}

impl CleanupControl {
    pub fn new() -> Self {
        Self {
            phase: AtomicU8::new(CleanupPhase::Preparing as u8),
            cancel_requested: AtomicBool::new(false),
        }
    }

    pub fn request_cancel(&self) -> bool {
        if self
            .phase
            .compare_exchange(
                CleanupPhase::Preparing as u8,
                CleanupPhase::Cancelled as u8,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_err()
        {
            return false;
        }

        self.cancel_requested.store(true, Ordering::Release);
        true
    }

    pub fn begin_execution(&self) -> bool {
        if self.cancel_requested.load(Ordering::Acquire) {
            return false;
        }

        self.phase
            .compare_exchange(
                CleanupPhase::Preparing as u8,
                CleanupPhase::Executing as u8,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_ok()
    }

    pub fn finish(&self) {
        self.phase
            .store(CleanupPhase::Finished as u8, Ordering::Release);
        self.cancel_requested.store(false, Ordering::Release);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel_requested.load(Ordering::Acquire)
            && self.phase.load(Ordering::Acquire) == CleanupPhase::Cancelled as u8
    }
}

impl Default for CleanupControl {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Default)]
struct ScanRegistry {
    targets: HashMap<String, RegisteredTarget>,
    in_flight: HashSet<String>,
    cleanup_controls: HashMap<String, Arc<CleanupControl>>,
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
            let providers = Arc::new(providers_for_scan(&settings));
            let target_event_handle = app_handle.clone();
            let stats = Arc::new(Mutex::new(ScanStats::default()));
            let stats_for_callback = Arc::clone(&stats);
            let registry_for_callback = Arc::clone(registry());
            let callback_scan_id = worker_scan_id.clone();
            let callback_event_scan_id = worker_scan_id.clone();
            let callback_root = canonical_root.clone();
            let callback_cancel_token = Arc::clone(&cancel_token);
            let callback_providers = Arc::clone(&providers);

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
                                providers: Arc::clone(&callback_providers),
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

    pub fn claim_target_for_cleanup(
        target_id: &str,
    ) -> NukeResult<(RegisteredTarget, Arc<CleanupControl>)> {
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

        let control = Arc::new(CleanupControl::new());
        registry.in_flight.insert(target_id.to_string());
        registry
            .cleanup_controls
            .insert(target_id.to_string(), Arc::clone(&control));
        Ok((target, control))
    }

    pub fn cancel_cleanup(target_id: &str) -> NukeResult<CancelCleanupResult> {
        let registry = registry().lock().unwrap();
        let cancelled = registry
            .cleanup_controls
            .get(target_id)
            .is_some_and(|control| control.request_cancel());
        Ok(CancelCleanupResult { cancelled })
    }

    pub fn finish_cleanup(target_id: &str) {
        let mut registry = registry().lock().unwrap();
        registry.in_flight.remove(target_id);
        if let Some(control) = registry.cleanup_controls.remove(target_id) {
            control.finish();
        }
        registry.targets.remove(target_id);
    }

    pub fn release_cleanup(target_id: &str) {
        let mut registry = registry().lock().unwrap();
        registry.in_flight.remove(target_id);
        registry.cleanup_controls.remove(target_id);
    }

    pub fn release_target(target_id: &str) {
        let mut registry = registry().lock().unwrap();
        registry.in_flight.remove(target_id);
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
    use super::{
        providers_for_scan, registry, CleanupControl, RegisteredTarget, ScanService,
        ScanStartResult,
    };
    use crate::commands::settings::AppSettings;
    use crate::errors::NukeError;
    use crate::models::action::CleanMode;
    use crate::models::category::Category;
    use crate::models::target::ScanTarget;
    use crate::services::clean_service::CleanService;
    use std::path::PathBuf;
    use std::sync::{mpsc, Arc, Barrier};
    use std::thread;

    #[test]
    fn cleanup_control_cancel_wins_only_during_preparing() {
        let control = CleanupControl::new();

        assert!(control.request_cancel());
        assert!(control.is_cancelled());
        assert!(!control.request_cancel());
        assert!(!control.begin_execution());
    }

    #[test]
    fn cleanup_control_execution_blocks_later_cancel() {
        let control = CleanupControl::new();

        assert!(control.begin_execution());
        assert!(!control.request_cancel());
        assert!(!control.begin_execution());
        control.finish();
        assert!(!control.request_cancel());
        assert!(!control.is_cancelled());
    }

    #[test]
    fn cleanup_control_cancel_execution_race_has_one_winner() {
        let control = Arc::new(CleanupControl::new());
        let barrier = Arc::new(Barrier::new(3));
        let (sender, receiver) = mpsc::channel();

        let cancel_control = Arc::clone(&control);
        let cancel_barrier = Arc::clone(&barrier);
        let cancel_sender = sender.clone();
        let cancel_thread = thread::spawn(move || {
            cancel_barrier.wait();
            cancel_sender.send(cancel_control.request_cancel()).unwrap();
        });

        let execution_control = Arc::clone(&control);
        let execution_barrier = Arc::clone(&barrier);
        let execution_sender = sender;
        let execution_thread = thread::spawn(move || {
            execution_barrier.wait();
            execution_sender
                .send(execution_control.begin_execution())
                .unwrap();
        });

        barrier.wait();
        let winners = [receiver.recv().unwrap(), receiver.recv().unwrap()];

        cancel_thread.join().unwrap();
        execution_thread.join().unwrap();

        assert_eq!(winners.iter().filter(|won| **won).count(), 1);
    }

    #[test]
    fn cleanup_cancelled_error_describes_pre_execution_cancellation() {
        assert_eq!(
            NukeError::CleanupCancelled.to_string(),
            "Cleanup cancelled before deletion"
        );
    }

    #[test]
    fn converts_core_target_preserving_scan_fields_and_pending_state() {
        let identity = Some(uncached_core::FileIdentity {
            volume_serial: 17,
            file_id: [29; 16],
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
    fn registered_target_retains_provider_snapshot_for_permanent_cleanup_without_settings() {
        let root =
            std::env::temp_dir().join(format!("uncached-provider-snapshot-{}", std::process::id()));
        let target_path = root.join("project/node_modules");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&target_path).unwrap();
        std::fs::write(root.join("project/package.json"), b"{}").unwrap();

        let settings = AppSettings {
            detect_cargo_target: false,
            ..AppSettings::default()
        };
        let providers = std::sync::Arc::new(providers_for_scan(&settings));
        let mut target =
            ScanTarget::new(target_path.clone(), Category::NodeModules, 0, false, None);
        target.identity = uncached_core::filesystem::file_identity(&target_path);
        let registered = RegisteredTarget {
            target,
            root_path: root.clone(),
            providers: std::sync::Arc::clone(&providers),
        };

        assert!(registered
            .providers
            .scanner_for(uncached_core::Category::CargoTarget)
            .is_none());
        assert!(registered
            .providers
            .scanner_for(uncached_core::Category::NodeModules)
            .is_some());
        assert!(CleanService::clean_registered_target(
            registered,
            None,
            CleanMode::Permanent,
            Some("Nuke".to_string()),
        )
        .is_ok());
        assert!(!target_path.exists());
        let _ = std::fs::remove_dir_all(root);
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
                providers: Arc::new(providers_for_scan(&AppSettings::default())),
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
                providers: Arc::new(providers_for_scan(&AppSettings::default())),
            },
        );

        ScanService::claim_target(&target_id).unwrap();
        assert!(ScanService::claim_target(&target_id).is_err());
        ScanService::release_target(&target_id);
        ScanService::claim_target(&target_id).unwrap();
        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn claim_target_for_cleanup_returns_control_and_cancel_preserves_target() {
        let target_id = format!("cleanup-control-target-{}", std::process::id());
        insert_test_target(&target_id);

        let (registered, control) = ScanService::claim_target_for_cleanup(&target_id).unwrap();
        assert_eq!(
            registered.target.path,
            PathBuf::from("C:\\workspace\\node_modules")
        );
        assert!(!control.is_cancelled());

        assert!(ScanService::cancel_cleanup(&target_id).unwrap().cancelled);
        assert!(!ScanService::cancel_cleanup(&target_id).unwrap().cancelled);
        assert!(ScanService::get_target(&target_id).is_ok());

        ScanService::release_cleanup(&target_id);
        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn cleanup_execution_blocks_cancellation() {
        let target_id = format!("cleanup-execution-target-{}", std::process::id());
        insert_test_target(&target_id);

        let (_, control) = ScanService::claim_target_for_cleanup(&target_id).unwrap();
        assert!(control.begin_execution());
        assert!(!ScanService::cancel_cleanup(&target_id).unwrap().cancelled);

        ScanService::finish_cleanup(&target_id);
        assert!(ScanService::get_target(&target_id).is_err());
    }

    #[test]
    fn cleanup_release_preserves_target_for_retry_and_finish_removes_authorization() {
        let target_id = format!("cleanup-lifecycle-target-{}", std::process::id());
        insert_test_target(&target_id);

        let (_, first_control) = ScanService::claim_target_for_cleanup(&target_id).unwrap();
        assert!(first_control.request_cancel());
        ScanService::release_cleanup(&target_id);

        let (_, second_control) = ScanService::claim_target_for_cleanup(&target_id).unwrap();
        assert!(!second_control.is_cancelled());
        ScanService::finish_cleanup(&target_id);

        assert!(ScanService::get_target(&target_id).is_err());
        assert!(!ScanService::cancel_cleanup(&target_id).unwrap().cancelled);
    }

    #[test]
    fn cleanup_claim_rejects_duplicate_claim() {
        let target_id = format!("cleanup-duplicate-target-{}", std::process::id());
        insert_test_target(&target_id);

        ScanService::claim_target_for_cleanup(&target_id).unwrap();
        assert!(ScanService::claim_target_for_cleanup(&target_id).is_err());

        ScanService::release_cleanup(&target_id);
        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn concurrent_cleanup_claims_have_one_winner() {
        let target_id = format!("cleanup-concurrent-target-{}", std::process::id());
        insert_test_target(&target_id);

        let barrier = Arc::new(Barrier::new(3));
        let (sender, receiver) = mpsc::channel();
        let mut threads = Vec::new();

        for _ in 0..2 {
            let barrier = Arc::clone(&barrier);
            let sender = sender.clone();
            let target_id = target_id.clone();
            threads.push(thread::spawn(move || {
                barrier.wait();
                sender
                    .send(ScanService::claim_target_for_cleanup(&target_id).is_ok())
                    .unwrap();
            }));
        }

        barrier.wait();
        let results = [receiver.recv().unwrap(), receiver.recv().unwrap()];
        for thread in threads {
            thread.join().unwrap();
        }

        assert_eq!(results.iter().filter(|won| **won).count(), 1);
        assert_eq!(results.iter().filter(|won| !**won).count(), 1);

        ScanService::release_cleanup(&target_id);
        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn scan_cancellation_does_not_remove_active_cleanup_control() {
        let scan_id = format!("cancel-active-cleanup-{}", std::process::id());
        let target_id = format!("{scan_id}-target");
        insert_test_target(&target_id);

        registry()
            .lock()
            .unwrap()
            .sessions
            .insert(scan_id.clone(), super::ScanSession::new());
        registry()
            .lock()
            .unwrap()
            .sessions
            .get_mut(&scan_id)
            .unwrap()
            .target_ids
            .insert(target_id.clone());
        ScanService::claim_target_for_cleanup(&target_id).unwrap();

        assert!(ScanService::cancel_scan(&scan_id).unwrap().cancelled);
        assert!(ScanService::cancel_cleanup(&target_id).unwrap().cancelled);

        ScanService::release_cleanup(&target_id);
        assert!(ScanService::get_target(&target_id).is_err());
    }

    fn insert_test_target(target_id: &str) {
        let target = ScanTarget::new(
            PathBuf::from("C:\\workspace\\node_modules"),
            Category::NodeModules,
            1,
            false,
            None,
        );
        registry().lock().unwrap().targets.insert(
            target_id.to_string(),
            RegisteredTarget {
                target,
                root_path: PathBuf::from("C:\\workspace"),
                providers: Arc::new(providers_for_scan(&AppSettings::default())),
            },
        );
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
                providers: Arc::new(providers_for_scan(&AppSettings::default())),
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
                providers: Arc::new(providers_for_scan(&AppSettings::default())),
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
