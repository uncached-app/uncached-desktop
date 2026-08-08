use crate::errors::{NukeError, NukeResult};
use crate::filesystem::paths::strip_extended_prefix;
use crate::models::target::ScanTarget;
use crate::scanner::get_default_providers;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
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
    walk_finished: bool,
    pending_sizes: usize,
    pending_size_ids: HashSet<String>,
    target_ids: HashSet<String>,
    publishing_target_ids: HashSet<String>,
}

impl ScanSession {
    fn new() -> Self {
        Self {
            cancel_token: Arc::new(AtomicBool::new(false)),
            cancelled: false,
            finished: false,
            walk_finished: false,
            pending_sizes: 0,
            pending_size_ids: HashSet::new(),
            target_ids: HashSet::new(),
            publishing_target_ids: HashSet::new(),
        }
    }

    fn register_size_job(&mut self, target_id: String) {
        if self.pending_size_ids.insert(target_id) {
            self.pending_sizes += 1;
        }
    }

    fn settle_size_job(&mut self, target_id: &str) -> bool {
        if !self.pending_size_ids.remove(target_id) {
            return false;
        }
        self.pending_sizes = self
            .pending_sizes
            .checked_sub(1)
            .expect("pending size job set and count must agree");
        true
    }

    fn can_finish(&self) -> bool {
        session_can_finish(self.walk_finished, self.pending_sizes)
            && !self.finished
            && !self.cancelled
    }
}

struct SizingJob {
    scan_id: String,
    target_id: String,
    path: PathBuf,
}

type SizeCalculator = Arc<dyn Fn(&Path) -> crate::filesystem::size::DirSize + Send + Sync>;
type EventSink = Arc<dyn Fn(&str, serde_json::Value) + Send + Sync>;

struct SizingController {
    sender: Option<SyncSender<SizingJob>>,
    workers: Vec<std::thread::JoinHandle<()>>,
    cancel_token: Arc<AtomicBool>,
}

#[derive(Clone)]
struct SizingSubmitter {
    sender: SyncSender<SizingJob>,
    cancel_token: Arc<AtomicBool>,
}

fn sizing_worker_count() -> usize {
    std::thread::available_parallelism()
        .map(|count| count.get().clamp(1, 8))
        .unwrap_or(1)
}

impl SizingController {
    fn new(
        app: &AppHandle,
        stats: &Arc<Mutex<ScanStats>>,
        started_at: Instant,
        cancel_token: Arc<AtomicBool>,
    ) -> Self {
        let event_sink = {
            let app = app.clone();
            Arc::new(move |event: &str, payload: serde_json::Value| {
                let _ = app.emit(event, payload);
            })
        };
        Self::with_hooks(
            sizing_worker_count(),
            Arc::new(crate::filesystem::size::calculate_dir_size_report),
            event_sink,
            cancel_token,
            stats,
            started_at,
        )
    }

    fn with_hooks(
        workers: usize,
        calculator: SizeCalculator,
        event_sink: EventSink,
        cancel_token: Arc<AtomicBool>,
        stats: &Arc<Mutex<ScanStats>>,
        started_at: Instant,
    ) -> Self {
        let (sender, receiver) = sync_channel::<SizingJob>(workers * 2);
        let receiver = Arc::new(Mutex::new(receiver));
        let mut worker_handles = Vec::with_capacity(workers);

        for _ in 0..workers {
            let receiver = Arc::clone(&receiver);
            let stats = Arc::clone(stats);
            let calculator = Arc::clone(&calculator);
            let event_sink = Arc::clone(&event_sink);
            let cancel_token = Arc::clone(&cancel_token);
            worker_handles.push(std::thread::spawn(move || loop {
                let job = receiver.lock().unwrap().recv();
                let Ok(job) = job else {
                    break;
                };
                if cancel_token.load(Ordering::Acquire) {
                    break;
                }
                let report = calculator(&job.path);
                if cancel_token.load(Ordering::Acquire) {
                    settle_size_job(
                        &job.scan_id,
                        &job.target_id,
                        &stats,
                        started_at,
                        &event_sink,
                        None,
                    );
                    continue;
                }
                let applied = apply_target_size_and_emit_for_session(
                    &job.scan_id,
                    &job.target_id,
                    report,
                    &event_sink,
                );
                if applied.is_some() {
                    crate::logging::info(
                        "size",
                        &format!(
                            "targetPath=\"{}\" bytes={} errors={}",
                            job.path.display(),
                            report.bytes,
                            report.errors
                        ),
                    );
                } else {
                    crate::logging::info(
                        "size",
                        &format!(
                            "discarded targetId=\"{}\" scanId=\"{}\"",
                            job.target_id, job.scan_id
                        ),
                    );
                }
                settle_size_job(
                    &job.scan_id,
                    &job.target_id,
                    &stats,
                    started_at,
                    &event_sink,
                    (applied.is_some() && report.errors == 0).then_some(report.bytes),
                );
            }));
        }

        Self {
            sender: Some(sender),
            workers: worker_handles,
            cancel_token,
        }
    }

    fn submitter(&self) -> SizingSubmitter {
        SizingSubmitter {
            sender: self.sender.as_ref().unwrap().clone(),
            cancel_token: Arc::clone(&self.cancel_token),
        }
    }

    fn finish(mut self) {
        self.sender.take();
        for worker in self.workers {
            let _ = worker.join();
        }
    }

    #[cfg(test)]
    fn for_test(workers: usize, calculator: SizeCalculator, event_sink: EventSink) -> Self {
        Self::for_test_with_cancel(
            workers,
            calculator,
            event_sink,
            Arc::new(AtomicBool::new(false)),
        )
    }

    #[cfg(test)]
    fn for_test_with_cancel(
        workers: usize,
        calculator: SizeCalculator,
        event_sink: EventSink,
        cancel_token: Arc<AtomicBool>,
    ) -> Self {
        let stats = Arc::new(Mutex::new(ScanStats::default()));
        Self::with_hooks(
            workers,
            calculator,
            event_sink,
            cancel_token,
            &stats,
            Instant::now(),
        )
    }
}

impl SizingSubmitter {
    fn submit(&self, mut job: SizingJob) -> bool {
        loop {
            match self.sender.try_send(job) {
                Ok(()) => return true,
                Err(TrySendError::Disconnected(_)) => return false,
                Err(TrySendError::Full(returned)) => {
                    if self.cancel_token.load(Ordering::Acquire) {
                        return false;
                    }
                    job = returned;
                    std::thread::yield_now();
                }
            }
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

fn release_claim(registry: &mut ScanRegistry, target_id: &str) {
    registry.in_flight.remove(target_id);
    registry.cleanup_controls.remove(target_id);
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
            let target_event_sink: EventSink = {
                let app = app_handle.clone();
                Arc::new(move |event, payload| {
                    let _ = app.emit(event, payload);
                })
            };
            let stats = Arc::new(Mutex::new(ScanStats::default()));
            let sizing =
                SizingController::new(&app_handle, &stats, started_at, Arc::clone(&cancel_token));
            let sizing_submitter = sizing.submitter();
            let callback_sizing_submitter = sizing_submitter.clone();
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

                        let mut registry = registry_for_callback.lock().unwrap();
                        let accepted = {
                            let Some(session) = registry.sessions.get_mut(&callback_scan_id) else {
                                return uncached_core::TraversalControl::Cancel;
                            };
                            if session.cancelled || session.cancel_token.load(Ordering::Acquire) {
                                false
                            } else {
                                session.target_ids.insert(target.id.clone());
                                session.register_size_job(target.id.clone());
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
                        emit_target_found(&target_event_sink, &callback_event_scan_id, &target);
                        crate::logging::info(
                            "scan",
                            &format!(
                                "target scanId=\"{}\" path=\"{}\" pending=true",
                                callback_event_scan_id,
                                target.path.display()
                            ),
                        );
                        if !callback_sizing_submitter.submit(SizingJob {
                            scan_id: callback_event_scan_id.clone(),
                            target_id: target.id.clone(),
                            path: target.path.clone(),
                        }) {
                            return uncached_core::TraversalControl::Cancel;
                        }
                        return uncached_core::TraversalControl::Prune;
                    }

                    let snapshot = serde_json::json!({
                        "scanId": callback_event_scan_id,
                        "directoriesScanned": stats.directories_scanned,
                        "targetsFound": stats.targets_found,
                        "totalBytesFound": stats.total_bytes_found
                    });
                    drop(stats);
                    target_event_sink("scan:progress", snapshot);
                    uncached_core::TraversalControl::Continue
                },
            );
            drop(sizing_submitter);

            match walk_result {
                Ok(uncached_core::TraversalOutcome::Cancelled) => {
                    crate::logging::info(
                        "scan",
                        &format!("cancelled scanId=\"{}\"", worker_scan_id),
                    );
                    let _ = ScanService::end_session(&worker_scan_id);
                    sizing.finish();
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
                        sizing.finish();
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
                    sizing.finish();
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

            if !ScanService::mark_walk_finished(&worker_scan_id, &app_handle, &stats, started_at) {
                sizing.finish();
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
            sizing.finish();
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

    pub fn refresh_target_size(target_id: &str) -> NukeResult<TargetSizeUpdate> {
        let path = {
            let mut registry = registry().lock().unwrap();
            let registered = registry
                .targets
                .get_mut(target_id)
                .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))?;
            registered.target.size_pending = true;
            registered.target.path.clone()
        };
        let report = crate::filesystem::size::calculate_dir_size_report(&path);
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

    fn mark_walk_finished(
        scan_id: &str,
        app: &AppHandle,
        stats: &Arc<Mutex<ScanStats>>,
        started_at: Instant,
    ) -> bool {
        let should_finish = {
            let mut registry = registry().lock().unwrap();
            let Some(session) = registry.sessions.get_mut(scan_id) else {
                return false;
            };
            session.walk_finished = true;
            if session.can_finish() {
                session.finished = true;
                registry.sessions.remove(scan_id);
                true
            } else {
                false
            }
        };
        if should_finish {
            let app = app.clone();
            let event_sink: EventSink = Arc::new(move |event, payload| {
                let _ = app.emit(event, payload);
            });
            emit_finished(&event_sink, scan_id, stats, started_at);
        }
        true
    }

    pub fn cancel_scan(scan_id: &str) -> NukeResult<CancelScanResult> {
        let mut registry = registry().lock().unwrap();
        let target_ids = {
            let Some(session) = registry.sessions.get_mut(scan_id) else {
                return Ok(CancelScanResult { cancelled: false });
            };
            if session.cancelled || session.finished {
                return Ok(CancelScanResult { cancelled: false });
            }

            session.cancel_token.store(true, Ordering::Release);
            session.cancelled = true;
            if session.publishing_target_ids.is_empty() {
                Some(session.target_ids.drain().collect::<Vec<_>>())
            } else {
                None
            }
        };
        if let Some(target_ids) = target_ids {
            registry.sessions.remove(scan_id);
            for target_id in target_ids {
                registry.in_flight.remove(&target_id);
                registry.targets.remove(&target_id);
            }
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
        if let Some(control) = registry.cleanup_controls.get(target_id) {
            control.finish();
        }
        release_claim(&mut registry, target_id);
        registry.targets.remove(target_id);
    }

    pub fn release_cleanup(target_id: &str) {
        let mut registry = registry().lock().unwrap();
        release_claim(&mut registry, target_id);
    }

    pub fn release_target(target_id: &str) {
        let mut registry = registry().lock().unwrap();
        release_claim(&mut registry, target_id);
    }

    pub fn remove_target(target_id: &str) -> NukeResult<RegisteredTarget> {
        let mut registry = registry().lock().unwrap();
        release_claim(&mut registry, target_id);
        registry
            .targets
            .remove(target_id)
            .ok_or_else(|| NukeError::NotFound(format!("Target {target_id}")))
    }
}

fn session_can_finish(walk_finished: bool, pending_sizes: usize) -> bool {
    walk_finished && pending_sizes == 0
}

fn apply_target_size_and_emit_for_session(
    scan_id: &str,
    target_id: &str,
    report: crate::filesystem::size::DirSize,
    event_sink: &EventSink,
) -> Option<TargetSizeUpdate> {
    let update = {
        let mut registry = registry().lock().unwrap();
        let accepted = registry
            .sessions
            .get(scan_id)
            .is_some_and(|session| !session.cancelled && session.target_ids.contains(target_id));
        if !accepted {
            return None;
        }
        registry
            .sessions
            .get_mut(scan_id)
            .unwrap()
            .publishing_target_ids
            .insert(target_id.to_string());
        let registered = match registry.targets.get_mut(target_id) {
            Some(registered) => registered,
            None => {
                registry
                    .sessions
                    .get_mut(scan_id)
                    .unwrap()
                    .publishing_target_ids
                    .remove(target_id);
                return None;
            }
        };
        registered.target.set_size(report.bytes, report.errors > 0);
        TargetSizeUpdate {
            scan_id: scan_id.to_string(),
            target_id: target_id.to_string(),
            size_bytes: registered.target.size_bytes,
            size_has_errors: registered.target.size_has_errors,
            size_pending: registered.target.size_pending,
            formatted_size: registered.target.formatted_size.clone(),
        }
    };
    // Cancellation defers target removal while this barrier is active. The sink runs outside
    // the registry lock, so sinks may safely call registry lifecycle methods.
    event_sink("scan:target_sized", serde_json::to_value(&update).unwrap());
    complete_target_publication(scan_id, target_id);
    Some(update)
}

#[cfg(test)]
fn apply_target_size_for_session(
    scan_id: &str,
    target_id: &str,
    report: crate::filesystem::size::DirSize,
) -> Option<TargetSizeUpdate> {
    let mut registry = registry().lock().unwrap();
    let session = registry.sessions.get(scan_id)?;
    if !session.target_ids.contains(target_id) {
        return None;
    }
    let registered = registry.targets.get_mut(target_id)?;
    registered.target.set_size(report.bytes, report.errors > 0);
    Some(TargetSizeUpdate {
        scan_id: scan_id.to_string(),
        target_id: target_id.to_string(),
        size_bytes: registered.target.size_bytes,
        size_has_errors: registered.target.size_has_errors,
        size_pending: registered.target.size_pending,
        formatted_size: registered.target.formatted_size.clone(),
    })
}

fn settle_size_job(
    scan_id: &str,
    target_id: &str,
    stats: &Arc<Mutex<ScanStats>>,
    started_at: Instant,
    event_sink: &EventSink,
    measured_bytes: Option<u64>,
) {
    let should_finish = {
        let mut registry = registry().lock().unwrap();
        let Some(session) = registry.sessions.get_mut(scan_id) else {
            return;
        };
        if !session.settle_size_job(target_id) {
            return;
        }
        if session.can_finish() {
            session.finished = true;
            registry.sessions.remove(scan_id);
            true
        } else {
            false
        }
    };
    if let Some(bytes) = measured_bytes {
        let mut stats = stats.lock().unwrap();
        stats.total_bytes_found = stats.total_bytes_found.saturating_add(bytes);
    }
    emit_progress(event_sink, scan_id, stats);
    if should_finish {
        emit_finished(event_sink, scan_id, stats, started_at);
    }
}

fn complete_target_publication(scan_id: &str, target_id: &str) {
    let mut registry = registry().lock().unwrap();
    let target_ids = {
        let Some(session) = registry.sessions.get_mut(scan_id) else {
            return;
        };
        session.publishing_target_ids.remove(target_id);
        if session.cancelled && session.publishing_target_ids.is_empty() {
            Some(session.target_ids.drain().collect::<Vec<_>>())
        } else {
            None
        }
    };
    if let Some(target_ids) = target_ids {
        registry.sessions.remove(scan_id);
        for target_id in target_ids {
            registry.in_flight.remove(&target_id);
            registry.targets.remove(&target_id);
        }
    }
}

fn emit_progress(event_sink: &EventSink, scan_id: &str, stats: &Arc<Mutex<ScanStats>>) {
    let stats = stats.lock().unwrap();
    event_sink(
        "scan:progress",
        serde_json::json!({
            "scanId": scan_id,
            "directoriesScanned": stats.directories_scanned,
            "targetsFound": stats.targets_found,
            "totalBytesFound": stats.total_bytes_found
        }),
    );
}

fn emit_finished(
    event_sink: &EventSink,
    scan_id: &str,
    stats: &Arc<Mutex<ScanStats>>,
    started_at: Instant,
) {
    let stats = stats.lock().unwrap();
    event_sink(
        "scan:finished",
        serde_json::json!({
            "scanId": scan_id,
            "totalTargets": stats.targets_found,
            "totalBytesFound": stats.total_bytes_found,
            "durationMs": started_at.elapsed().as_millis()
        }),
    );
}

fn emit_target_found(event_sink: &EventSink, scan_id: &str, target: &ScanTarget) {
    event_sink(
        "scan:target_found",
        serde_json::json!({
            "scanId": scan_id,
            "target": target,
        }),
    );
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
        ScanStartResult, SizingController, SizingJob, NEXT_SCAN_ID,
    };
    use crate::commands::settings::AppSettings;
    use crate::errors::NukeError;
    use crate::filesystem::size::DirSize;
    use crate::models::action::CleanMode;
    use crate::models::category::Category;
    use crate::models::target::ScanTarget;
    use crate::services::clean_service::CleanService;
    use std::path::PathBuf;
    use std::sync::atomic::Ordering;
    use std::sync::{mpsc, Arc, Barrier};
    use std::thread;

    #[test]
    fn session_can_finish_only_after_walk_and_sizes_settle() {
        assert!(!super::session_can_finish(true, 1));
        assert!(super::session_can_finish(true, 0));
        assert!(!super::session_can_finish(false, 0));
    }

    #[test]
    fn sizing_worker_count_is_bounded() {
        assert!((1..=8).contains(&super::sizing_worker_count()));
    }

    #[test]
    fn finished_waits_for_every_registered_size_job() {
        let mut session = super::ScanSession::new();
        session.register_size_job("target-1".to_string());
        session.register_size_job("target-2".to_string());
        session.walk_finished = true;

        assert!(session.settle_size_job("target-1"));
        assert!(!session.can_finish());
        assert!(session.settle_size_job("target-2"));
        assert!(session.can_finish());
    }

    #[test]
    fn worker_completion_before_walk_end_does_not_finish_session() {
        let mut session = super::ScanSession::new();
        session.register_size_job("target-1".to_string());

        assert!(session.settle_size_job("target-1"));
        assert!(!session.can_finish());
        session.walk_finished = true;
        assert!(session.can_finish());
    }

    #[test]
    fn sizing_error_settles_target_without_scan_failure() {
        let mut session = super::ScanSession::new();
        session.register_size_job("target-1".to_string());
        session.walk_finished = true;

        let update = super::TargetSizeUpdate {
            scan_id: "scan-1".to_string(),
            target_id: "target-1".to_string(),
            size_bytes: 0,
            size_has_errors: true,
            size_pending: false,
            formatted_size: "0 B".to_string(),
        };

        assert!(update.size_has_errors);
        assert!(!update.size_pending);
        assert!(session.settle_size_job("target-1"));
        assert!(session.can_finish());
    }

    #[test]
    fn duplicate_settlement_cannot_finish_session_early() {
        let mut session = super::ScanSession::new();
        session.register_size_job("target-1".to_string());
        session.register_size_job("target-2".to_string());
        session.walk_finished = true;

        assert!(session.settle_size_job("target-1"));
        assert!(!session.settle_size_job("target-1"));
        assert!(!session.can_finish());
        assert!(session.settle_size_job("target-2"));
        assert!(session.can_finish());
    }

    #[test]
    fn cancellation_discards_late_updates() {
        let scan_id = format!("cancel-late-{}", std::process::id());
        let target_id = format!("{scan_id}-target");
        let mut session = super::ScanSession::new();
        session.target_ids.insert(target_id.clone());
        session.register_size_job(target_id.clone());
        registry()
            .lock()
            .unwrap()
            .sessions
            .insert(scan_id.clone(), session);
        insert_test_target(&target_id);

        ScanService::cancel_scan(&scan_id).unwrap();
        assert!(super::apply_target_size_for_session(
            &scan_id,
            &target_id,
            DirSize {
                bytes: 1,
                errors: 0
            },
        )
        .is_none());
        assert!(!registry().lock().unwrap().targets.contains_key(&target_id));
    }

    #[test]
    fn empty_scan_finishes_without_sizing_jobs() {
        let mut session = super::ScanSession::new();

        session.walk_finished = true;

        assert!(session.can_finish());
        assert_eq!(session.pending_sizes, 0);
        assert!(session.pending_size_ids.is_empty());
    }

    #[test]
    fn sizing_error_settles_visible_target_with_error_flag() {
        let scan_id = format!("size-error-{}", std::process::id());
        let target_id = format!("{scan_id}-target");
        insert_test_target(&target_id);
        let mut registry_guard = registry().lock().unwrap();
        let session = super::ScanSession::new();
        registry_guard.sessions.insert(scan_id.clone(), session);
        registry_guard
            .sessions
            .get_mut(&scan_id)
            .unwrap()
            .target_ids
            .insert(target_id.clone());
        drop(registry_guard);

        let update = super::apply_target_size_for_session(
            &scan_id,
            &target_id,
            DirSize {
                bytes: 0,
                errors: 1,
            },
        )
        .unwrap();

        assert!(!update.size_pending);
        assert!(update.size_has_errors);
        ScanService::remove_target(&target_id).unwrap();
        registry().lock().unwrap().sessions.remove(&scan_id);
    }

    #[test]
    fn late_size_update_for_removed_target_does_not_recreate_registry_state() {
        let scan_id = format!("late-size-{}", std::process::id());
        let target_id = format!("{scan_id}-target");
        registry()
            .lock()
            .unwrap()
            .sessions
            .insert(scan_id.clone(), super::ScanSession::new());
        insert_test_target(&target_id);
        registry().lock().unwrap().targets.remove(&target_id);

        assert!(super::apply_target_size_for_session(
            &scan_id,
            &target_id,
            DirSize {
                bytes: 1,
                errors: 0
            },
        )
        .is_none());
        assert!(!registry().lock().unwrap().targets.contains_key(&target_id));
        registry().lock().unwrap().sessions.remove(&scan_id);
    }

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
            Arc::new(CleanupControl::new()),
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
    fn sizing_controller_respects_injected_worker_limit() {
        let active = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let maximum = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let (started_sender, started_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        let release_receiver = Arc::new(std::sync::Mutex::new(release_receiver));
        let active_for_calculator = Arc::clone(&active);
        let maximum_for_calculator = Arc::clone(&maximum);
        let calculator = Arc::new(move |_: &std::path::Path| {
            let current = active_for_calculator.fetch_add(1, Ordering::AcqRel) + 1;
            maximum_for_calculator.fetch_max(current, Ordering::AcqRel);
            started_sender.send(()).unwrap();
            release_receiver.lock().unwrap().recv().unwrap();
            active_for_calculator.fetch_sub(1, Ordering::AcqRel);
            DirSize {
                bytes: 0,
                errors: 0,
            }
        });
        let (_, sink) = event_sink();
        let controller = SizingController::for_test(2, calculator, sink);
        let submitter = controller.submitter();
        for index in 0..3 {
            assert!(submitter.submit(SizingJob {
                scan_id: format!("scan-limit-{index}"),
                target_id: format!("target-limit-{index}"),
                path: PathBuf::from("C:\\workspace"),
            }));
        }
        started_receiver.recv().unwrap();
        started_receiver.recv().unwrap();
        assert!(started_receiver.try_recv().is_err());
        for _ in 0..3 {
            release_sender.send(()).unwrap();
        }
        drop(submitter);
        controller.finish();
        assert_eq!(maximum.load(Ordering::Acquire), 2);
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
        assert!(!control.request_cancel());
        assert!(ScanService::get_target(&target_id).is_err());
    }

    #[test]
    fn cleanup_finish_marks_control_finished_before_removal() {
        let target_id = format!("cleanup-finish-target-{}", std::process::id());
        insert_test_target(&target_id);

        let (_, control) = ScanService::claim_target_for_cleanup(&target_id).unwrap();
        ScanService::finish_cleanup(&target_id);

        assert!(!control.request_cancel());
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
    fn cleanup_claim_rejects_pending_target() {
        let target_id = format!("cleanup-pending-target-{}", std::process::id());
        let mut target = ScanTarget::new(
            PathBuf::from("C:\\workspace\\node_modules"),
            Category::NodeModules,
            0,
            false,
            None,
        );
        target.size_pending = true;
        registry().lock().unwrap().targets.insert(
            target_id.clone(),
            RegisteredTarget {
                target,
                root_path: PathBuf::from("C:\\workspace"),
                providers: Arc::new(providers_for_scan(&AppSettings::default())),
            },
        );

        assert!(ScanService::claim_target_for_cleanup(&target_id).is_err());
        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn cleanup_claim_rejects_sizing_error_target() {
        let target_id = format!("cleanup-error-target-{}", std::process::id());
        let target = ScanTarget::new(
            PathBuf::from("C:\\workspace\\node_modules"),
            Category::NodeModules,
            0,
            true,
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

        assert!(ScanService::claim_target_for_cleanup(&target_id).is_err());
        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn legacy_release_target_clears_active_cleanup_control() {
        let target_id = format!("legacy-release-cleanup-{}", std::process::id());
        insert_test_target(&target_id);

        ScanService::claim_target_for_cleanup(&target_id).unwrap();
        ScanService::release_target(&target_id);

        assert!(!ScanService::cancel_cleanup(&target_id).unwrap().cancelled);
        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn legacy_remove_target_clears_active_cleanup_control() {
        let target_id = format!("legacy-remove-cleanup-{}", std::process::id());
        insert_test_target(&target_id);

        ScanService::claim_target_for_cleanup(&target_id).unwrap();
        ScanService::remove_target(&target_id).unwrap();

        assert!(!ScanService::cancel_cleanup(&target_id).unwrap().cancelled);
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

    fn event_sink() -> (Arc<std::sync::Mutex<Vec<String>>>, super::EventSink) {
        let events = Arc::new(std::sync::Mutex::new(Vec::new()));
        let events_for_sink = Arc::clone(&events);
        let sink: super::EventSink = Arc::new(move |event: &str, _: serde_json::Value| {
            events_for_sink.lock().unwrap().push(event.to_string());
        });
        (events, sink)
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
            Arc::new(CleanupControl::new()),
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
    fn sizing_controller_uses_real_workers_and_settlement_path() {
        let scan_id = format!("scan-controller-{}", std::process::id());
        let target_id = format!("{scan_id}-target");
        insert_test_target(&target_id);
        registry()
            .lock()
            .unwrap()
            .targets
            .get_mut(&target_id)
            .unwrap()
            .target
            .size_pending = true;
        let mut session = super::ScanSession::new();
        session.target_ids.insert(target_id.clone());
        session.register_size_job(target_id.clone());
        session.walk_finished = true;
        registry()
            .lock()
            .unwrap()
            .sessions
            .insert(scan_id.clone(), session);

        let events = Arc::new(std::sync::Mutex::new(
            Vec::<(String, serde_json::Value)>::new(),
        ));
        let events_for_sink = Arc::clone(&events);
        let sink: super::EventSink = Arc::new(move |event: &str, payload: serde_json::Value| {
            events_for_sink
                .lock()
                .unwrap()
                .push((event.to_string(), payload));
        });
        super::emit_target_found(
            &sink,
            &scan_id,
            &ScanService::get_target(&target_id).unwrap().target,
        );
        let controller = SizingController::for_test(
            1,
            Arc::new(|_: &std::path::Path| DirSize {
                bytes: 7,
                errors: 0,
            }),
            sink,
        );
        controller.submitter().submit(SizingJob {
            scan_id: scan_id.clone(),
            target_id: target_id.clone(),
            path: PathBuf::from("C:\\workspace"),
        });
        controller.finish();

        assert_eq!(
            ScanService::get_target(&target_id)
                .unwrap()
                .target
                .size_bytes,
            7
        );
        assert!(!registry().lock().unwrap().sessions.contains_key(&scan_id));
        let events = events.lock().unwrap();
        assert_eq!(
            events
                .iter()
                .map(|(event, _)| event.as_str())
                .collect::<Vec<_>>(),
            [
                "scan:target_found",
                "scan:target_sized",
                "scan:progress",
                "scan:finished"
            ]
        );
        assert_eq!(events[0].1["target"]["sizePending"], true);
        assert_eq!(events[1].1["sizeBytes"], 7);
        assert_eq!(events[2].1["totalBytesFound"], 7);
        assert_eq!(events[3].1["totalBytesFound"], 7);
        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn sizing_controller_waits_for_all_jobs_and_emits_finished_once() {
        let scan_id = format!(
            "scan-controller-wait-{}",
            NEXT_SCAN_ID.fetch_add(1, Ordering::Relaxed)
        );
        let first_target_id = format!("{scan_id}-first");
        let second_target_id = format!("{scan_id}-second");
        insert_test_target(&first_target_id);
        insert_test_target(&second_target_id);
        let mut session = super::ScanSession::new();
        for target_id in [&first_target_id, &second_target_id] {
            session.target_ids.insert(target_id.to_string());
            session.register_size_job(target_id.to_string());
        }
        session.walk_finished = true;
        registry()
            .lock()
            .unwrap()
            .sessions
            .insert(scan_id.clone(), session);

        let events = Arc::new(std::sync::Mutex::new(
            Vec::<(String, serde_json::Value)>::new(),
        ));
        let events_for_sink = Arc::clone(&events);
        let sink: super::EventSink = Arc::new(move |event: &str, payload: serde_json::Value| {
            events_for_sink
                .lock()
                .unwrap()
                .push((event.to_string(), payload));
        });
        let (started_sender, started_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        let release_receiver = Arc::new(std::sync::Mutex::new(release_receiver));
        let calculator = Arc::new(move |_: &std::path::Path| {
            started_sender.send(()).unwrap();
            release_receiver.lock().unwrap().recv().unwrap();
            DirSize {
                bytes: 1,
                errors: 0,
            }
        });
        let controller = SizingController::for_test(1, calculator, sink);
        let submitter = controller.submitter();
        for target_id in [&first_target_id, &second_target_id] {
            assert!(submitter.submit(SizingJob {
                scan_id: scan_id.clone(),
                target_id: target_id.clone(),
                path: PathBuf::from("C:\\workspace"),
            }));
        }
        started_receiver.recv().unwrap();
        release_sender.send(()).unwrap();
        started_receiver.recv().unwrap();
        assert_eq!(
            events
                .lock()
                .unwrap()
                .iter()
                .filter(|(event, _)| event == "scan:finished")
                .count(),
            0
        );
        release_sender.send(()).unwrap();
        drop(submitter);
        controller.finish();

        assert_eq!(
            events
                .lock()
                .unwrap()
                .iter()
                .filter(|(event, _)| event == "scan:finished")
                .count(),
            1
        );
        assert!(!registry().lock().unwrap().sessions.contains_key(&scan_id));
        ScanService::remove_target(&first_target_id).unwrap();
        ScanService::remove_target(&second_target_id).unwrap();
    }

    #[test]
    fn sizing_controller_settles_real_error_without_scan_failure() {
        let scan_id = format!(
            "scan-controller-error-{}",
            NEXT_SCAN_ID.fetch_add(1, Ordering::Relaxed)
        );
        let target_id = format!("{scan_id}-target");
        insert_test_target(&target_id);
        let mut session = super::ScanSession::new();
        session.target_ids.insert(target_id.clone());
        session.register_size_job(target_id.clone());
        session.walk_finished = true;
        registry()
            .lock()
            .unwrap()
            .sessions
            .insert(scan_id.clone(), session);

        let events = Arc::new(std::sync::Mutex::new(
            Vec::<(String, serde_json::Value)>::new(),
        ));
        let events_for_sink = Arc::clone(&events);
        let sink: super::EventSink = Arc::new(move |event: &str, payload: serde_json::Value| {
            events_for_sink
                .lock()
                .unwrap()
                .push((event.to_string(), payload));
        });
        let controller = SizingController::for_test(
            1,
            Arc::new(|_: &std::path::Path| DirSize {
                bytes: 3,
                errors: 1,
            }),
            sink,
        );
        assert!(controller.submitter().submit(SizingJob {
            scan_id: scan_id.clone(),
            target_id: target_id.clone(),
            path: PathBuf::from("C:\\workspace"),
        }));
        controller.finish();

        let target = ScanService::get_target(&target_id).unwrap();
        assert_eq!(target.target.size_bytes, 3);
        assert!(target.target.size_has_errors);
        assert!(!target.target.size_pending);
        assert!(!events
            .lock()
            .unwrap()
            .iter()
            .any(|(event, _)| event == "scan:failed"));
        assert_eq!(
            events
                .lock()
                .unwrap()
                .iter()
                .filter(|(event, _)| event == "scan:finished")
                .count(),
            1
        );
        assert_eq!(
            events
                .lock()
                .unwrap()
                .iter()
                .find(|(event, _)| event == "scan:finished")
                .unwrap()
                .1["totalBytesFound"],
            0
        );
        assert!(!registry().lock().unwrap().sessions.contains_key(&scan_id));
        ScanService::remove_target(&target_id).unwrap();
    }

    #[test]
    fn sizing_controller_cancellation_joins_active_worker_without_late_events() {
        let scan_id = format!("scan-controller-cancel-{}", std::process::id());
        let target_id = format!("{scan_id}-target");
        insert_test_target(&target_id);
        let mut session = super::ScanSession::new();
        session.target_ids.insert(target_id.clone());
        session.register_size_job(target_id.clone());
        let cancel_token = Arc::clone(&session.cancel_token);
        registry()
            .lock()
            .unwrap()
            .sessions
            .insert(scan_id.clone(), session);

        let (started_sender, started_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        let release_receiver = Arc::new(std::sync::Mutex::new(release_receiver));
        let calculator = Arc::new(move |_: &std::path::Path| {
            started_sender.send(()).unwrap();
            release_receiver.lock().unwrap().recv().unwrap();
            DirSize {
                bytes: 9,
                errors: 0,
            }
        });
        let events = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        let events_for_sink = Arc::clone(&events);
        let sink = Arc::new(move |event: &str, _: serde_json::Value| {
            events_for_sink.lock().unwrap().push(event.to_string());
        });
        let controller =
            SizingController::for_test_with_cancel(1, calculator, sink, cancel_token.clone());
        controller.submitter().submit(SizingJob {
            scan_id: scan_id.clone(),
            target_id: target_id.clone(),
            path: PathBuf::from("C:\\workspace"),
        });
        started_receiver.recv().unwrap();
        cancel_token.store(true, Ordering::Release);
        assert!(ScanService::cancel_scan(&scan_id).unwrap().cancelled);
        release_sender.send(()).unwrap();
        controller.finish();

        assert!(events.lock().unwrap().is_empty());
        assert!(ScanService::get_target(&target_id).is_err());
    }

    #[test]
    fn cancellation_cannot_remove_target_before_sized_event_publication() {
        let scan_id = format!(
            "scan-publication-race-{}",
            NEXT_SCAN_ID.fetch_add(1, Ordering::Relaxed)
        );
        let target_id = format!("{scan_id}-target");
        insert_test_target(&target_id);
        let mut session = super::ScanSession::new();
        session.target_ids.insert(target_id.clone());
        session.register_size_job(target_id.clone());
        let cancel_token = Arc::clone(&session.cancel_token);
        registry()
            .lock()
            .unwrap()
            .sessions
            .insert(scan_id.clone(), session);

        let (publication_started_sender, publication_started_receiver) = mpsc::channel();
        let (publication_release_sender, publication_release_receiver) = mpsc::channel();
        let publication_release_receiver =
            Arc::new(std::sync::Mutex::new(publication_release_receiver));
        let events = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        let events_for_sink = Arc::clone(&events);
        let sink: super::EventSink = Arc::new(move |event: &str, payload: serde_json::Value| {
            if event == "scan:target_sized" {
                publication_started_sender.send(()).unwrap();
                publication_release_receiver.lock().unwrap().recv().unwrap();
            }
            events_for_sink.lock().unwrap().push(event.to_string());
            let _ = payload;
        });
        let controller = SizingController::for_test_with_cancel(
            1,
            Arc::new(|_: &std::path::Path| DirSize {
                bytes: 9,
                errors: 0,
            }),
            sink,
            cancel_token,
        );
        assert!(controller.submitter().submit(SizingJob {
            scan_id: scan_id.clone(),
            target_id: target_id.clone(),
            path: PathBuf::from("C:\\workspace"),
        }));
        publication_started_receiver.recv().unwrap();

        let (cancellation_result_sender, cancellation_result_receiver) = mpsc::channel();
        let cancellation = thread::spawn(move || {
            cancellation_result_sender
                .send(ScanService::cancel_scan(&scan_id).unwrap())
                .unwrap();
        });
        assert!(
            cancellation_result_receiver
                .recv_timeout(std::time::Duration::from_millis(50))
                .unwrap()
                .cancelled
        );
        assert!(ScanService::get_target(&target_id).is_ok());
        publication_release_sender.send(()).unwrap();
        assert!(cancellation.join().is_ok());
        controller.finish();

        assert_eq!(events.lock().unwrap().as_slice(), &["scan:target_sized"]);
        assert!(ScanService::get_target(&target_id).is_err());
    }

    #[test]
    fn sizing_controller_cancellation_discards_queued_and_active_jobs() {
        let scan_id = format!(
            "scan-controller-queue-cancel-{}",
            NEXT_SCAN_ID.fetch_add(1, Ordering::Relaxed)
        );
        let active_target_id = format!("{scan_id}-active");
        let queued_target_id = format!("{scan_id}-queued");
        insert_test_target(&active_target_id);
        insert_test_target(&queued_target_id);
        let mut session = super::ScanSession::new();
        for target_id in [&active_target_id, &queued_target_id] {
            session.target_ids.insert(target_id.to_string());
            session.register_size_job(target_id.to_string());
        }
        let cancel_token = Arc::clone(&session.cancel_token);
        registry()
            .lock()
            .unwrap()
            .sessions
            .insert(scan_id.clone(), session);

        let (started_sender, started_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        let release_receiver = Arc::new(std::sync::Mutex::new(release_receiver));
        let calculator = Arc::new(move |_: &std::path::Path| {
            started_sender.send(()).unwrap();
            release_receiver.lock().unwrap().recv().unwrap();
            DirSize {
                bytes: 9,
                errors: 0,
            }
        });
        let (events, sink) = event_sink();
        let controller =
            SizingController::for_test_with_cancel(1, calculator, sink, Arc::clone(&cancel_token));
        let submitter = controller.submitter();
        assert!(submitter.submit(SizingJob {
            scan_id: scan_id.clone(),
            target_id: active_target_id.clone(),
            path: PathBuf::from("C:\\workspace"),
        }));
        assert!(submitter.submit(SizingJob {
            scan_id: scan_id.clone(),
            target_id: queued_target_id.clone(),
            path: PathBuf::from("C:\\workspace"),
        }));
        started_receiver.recv().unwrap();
        assert!(ScanService::cancel_scan(&scan_id).unwrap().cancelled);
        drop(submitter);
        release_sender.send(()).unwrap();
        controller.finish();

        assert!(events.lock().unwrap().is_empty());
        assert!(ScanService::get_target(&active_target_id).is_err());
        assert!(ScanService::get_target(&queued_target_id).is_err());
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
