//! Building and emitting the `scan:*` events the interface listens to.

use super::*;

pub fn platform() -> uncached_core::contract::v1::Platform {
    #[cfg(target_os = "windows")]
    return uncached_core::contract::v1::Platform::Windows;
    #[cfg(target_os = "macos")]
    return uncached_core::contract::v1::Platform::Macos;
    #[cfg(target_os = "linux")]
    return uncached_core::contract::v1::Platform::Linux;
    #[cfg(target_os = "android")]
    return uncached_core::contract::v1::Platform::Android;
    #[allow(unreachable_code)]
    uncached_core::contract::v1::Platform::Unsupported
}

pub(crate) fn public_error_info(error: &NukeError) -> uncached_core::CoreErrorInfo {
    let core_error = match error {
        NukeError::Core(info) => return info.clone(),
        // Carries the program's name and nothing else about the target.
        NukeError::InUse(owner) => uncached_core::CoreError::TargetInUse {
            program: owner.clone(),
        },
        NukeError::Io(error) => {
            uncached_core::CoreError::Io(std::io::Error::new(error.kind(), "desktop I/O error"))
        }
        // These variants are retained for desktop-local validation paths. Map them
        // to stable core errors instead of exposing their private messages.
        NukeError::NotFound(_) => uncached_core::CoreError::TargetMissing {
            path: "target".into(),
        },
        NukeError::NoScanRoot | NukeError::NotADirectory(_) => {
            uncached_core::CoreError::InvalidWorkspace("scan root".into())
        }
        NukeError::PermissionDenied(_) => uncached_core::CoreError::SecureDeletionFailed {
            path: "target".into(),
            source: std::io::Error::other("desktop permission denied"),
        },
        NukeError::ScanCancelled | NukeError::CleanupCancelled | NukeError::Internal(_) => {
            uncached_core::CoreError::Io(std::io::Error::other("desktop operation failed"))
        }
    };
    core_error.public_info()
}

#[cfg(test)]
pub fn error_event(
    error: &NukeError,
) -> uncached_core::contract::v1::ApiEnvelope<serde_json::Value> {
    uncached_core::contract::v1::ApiEnvelope::failure(platform(), public_error_info(error))
}

pub fn scan_failed_event(
    scan_id: &str,
    error: &NukeError,
) -> uncached_core::contract::v1::ApiEnvelope<uncached_core::contract::v1::ScanFailedDto> {
    uncached_core::contract::v1::ApiEnvelope::success(
        platform(),
        uncached_core::contract::v1::ScanFailedDto {
            scan_id: scan_id.to_owned(),
            error: public_error_info(error),
        },
    )
}

pub(super) fn value_event(
    data: serde_json::Value,
) -> uncached_core::contract::v1::ApiEnvelope<serde_json::Value> {
    uncached_core::contract::v1::ApiEnvelope::success(platform(), data)
}

/// Serializes the target itself instead of mirroring its fields. A payload
/// spelled out by hand drifts from the model in silence: a field added to
/// `ScanTarget` simply never reaches the UI. `identity` stays out of the wire
/// through `#[serde(skip)]` on the model, which is where that decision belongs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetFoundEvent<'a> {
    pub scan_id: &'a str,
    pub target: &'a ScanTarget,
}

pub fn target_found_event<'a>(
    scan_id: &'a str,
    target: &'a ScanTarget,
) -> uncached_core::contract::v1::ApiEnvelope<TargetFoundEvent<'a>> {
    uncached_core::contract::v1::ApiEnvelope::success(
        platform(),
        TargetFoundEvent { scan_id, target },
    )
}

pub fn target_sized_event(
    update: &TargetSizeUpdate,
) -> uncached_core::contract::v1::ApiEnvelope<uncached_core::contract::v1::TargetSizedDto> {
    uncached_core::contract::v1::ApiEnvelope::success(
        platform(),
        uncached_core::contract::v1::TargetSizedDto {
            scan_id: update.scan_id.clone(),
            target_id: update.target_id.clone(),
            size_bytes: update.size_bytes,
            size_pending: update.size_pending,
            size_has_errors: update.size_has_errors,
            formatted_size: update.formatted_size.clone(),
        },
    )
}

pub fn scan_finished_event(
    scan_id: &str,
    total_targets: u64,
    total_bytes: u64,
    duration_ms: u128,
    unreadable: u64,
) -> uncached_core::contract::v1::ApiEnvelope<uncached_core::contract::v1::ScanFinishedDto> {
    uncached_core::contract::v1::ApiEnvelope::success(
        platform(),
        uncached_core::contract::v1::ScanFinishedDto {
            scan_id: scan_id.to_owned(),
            total_targets,
            total_bytes_found: total_bytes,
            duration_ms,
            unreadable,
        },
    )
}

/// The most often a walk reports how far it has got.
///
/// The walker visits on the order of a hundred thousand directories a second,
/// and each one used to send an event across the process boundary: serialized
/// here, parsed there, and answered with a render of the whole screen. The
/// interface absorbs a little over a thousand of those a second, so a long scan
/// queued minutes of "N directories checked" behind it and the finish arrived
/// after all of them. The counters themselves are updated for every directory;
/// only how often they are *shown* is limited, and ten times a second reads as
/// continuous.
pub(super) const PROGRESS_INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);

/// Lets one report through per interval and drops the rest.
///
/// The window restarts from the last report that was let through, not from the
/// last call, so a steady stream is sampled at the interval rather than starved.
pub(super) struct ProgressThrottle {
    interval: std::time::Duration,
    last: Option<Instant>,
}

impl ProgressThrottle {
    pub(super) fn new(interval: std::time::Duration) -> Self {
        Self {
            interval,
            last: None,
        }
    }

    /// Whether a report may be sent at `now`. The first one always may.
    pub(super) fn ready_at(&mut self, now: Instant) -> bool {
        match self.last {
            Some(last) if now.duration_since(last) < self.interval => false,
            _ => {
                self.last = Some(now);
                true
            }
        }
    }
}

pub(super) fn emit_progress(event_sink: &EventSink, scan_id: &str, stats: &Arc<Mutex<ScanStats>>) {
    let stats = lock(stats);
    event_sink(
        "scan:progress",
        serde_json::to_value(value_event(serde_json::json!({
            "scanId": scan_id,
            "directoriesScanned": stats.directories_scanned,
            "targetsFound": stats.targets_found,
            "totalBytesFound": stats.total_bytes_found,
            "phase": stats.phase.as_wire()
        })))
        .unwrap(),
    );
}

/// What a cancelled scan had already found when it stopped.
///
/// The three cancel paths used to send zeroes here, which `docs/IPC.md`
/// documented as counts and the interface validated on arrival before throwing
/// them away — a contract field that could only ever be false. A scan stopped
/// after finding four gigabytes found four gigabytes, and that is worth saying
/// rather than reporting as nothing.
pub(super) fn cancelled_event(
    scan_id: &str,
    stats: &Arc<Mutex<ScanStats>>,
) -> uncached_core::contract::v1::ApiEnvelope<serde_json::Value> {
    let stats = lock(stats);
    value_event(serde_json::json!({
        "scanId": scan_id,
        "totalTargets": stats.targets_found,
        "totalBytesFound": stats.total_bytes_found,
    }))
}

pub(super) fn emit_finished(
    event_sink: &EventSink,
    scan_id: &str,
    stats: &Arc<Mutex<ScanStats>>,
    started_at: Instant,
) {
    let stats = lock(stats);
    event_sink(
        "scan:finished",
        serde_json::to_value(scan_finished_event(
            scan_id,
            stats.targets_found,
            stats.total_bytes_found,
            started_at.elapsed().as_millis(),
            stats.unreadable,
        ))
        .unwrap(),
    );
}

pub(super) fn emit_target_found(event_sink: &EventSink, scan_id: &str, target: &ScanTarget) {
    event_sink(
        "scan:target_found",
        serde_json::to_value(target_found_event(scan_id, target)).unwrap(),
    );
}
