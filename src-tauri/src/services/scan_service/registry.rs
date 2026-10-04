//! What the app remembers between commands: scan sessions, the targets they
//! found, and which of them a cleanup has claimed.

use super::*;

#[derive(Default)]
pub(super) struct ScanRegistry {
    pub(super) targets: HashMap<String, RegisteredTarget>,
    pub(super) in_flight: HashSet<String>,
    pub(super) cleanup_controls: HashMap<String, Arc<CleanupControl>>,
    pub(super) sessions: HashMap<String, ScanSession>,
}

#[derive(Debug, Clone)]
pub(super) struct ScanSession {
    pub(super) cancel_token: Arc<AtomicBool>,
    pub(super) cancelled: bool,
    pub(super) finished: bool,
    pub(super) walk_finished: bool,
    pub(super) pending_sizes: usize,
    pub(super) pending_size_ids: HashSet<String>,
    pub(super) target_ids: HashSet<String>,
    pub(super) publishing_target_ids: HashSet<String>,
}

impl ScanSession {
    pub(super) fn new() -> Self {
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

    pub(super) fn register_size_job(&mut self, target_id: String) {
        if self.pending_size_ids.insert(target_id) {
            self.pending_sizes += 1;
        }
    }

    pub(super) fn settle_size_job(&mut self, target_id: &str) -> bool {
        if !self.pending_size_ids.remove(target_id) {
            return false;
        }
        self.pending_sizes = self
            .pending_sizes
            .checked_sub(1)
            .expect("pending size job set and count must agree");
        true
    }

    pub(super) fn can_finish(&self) -> bool {
        session_can_finish(self.walk_finished, self.pending_sizes)
            && !self.finished
            && !self.cancelled
    }
}

pub(super) static REGISTRY: OnceLock<Arc<Mutex<ScanRegistry>>> = OnceLock::new();
pub(super) static NEXT_SCAN_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

/// Locks a mutex, carrying on when another thread panicked while holding it.
///
/// A panic in one worker must not turn into a panic in every command after it:
/// with `lock().unwrap()` a single failed invariant in the sizing code poisons
/// the registry for good, and from then on every scan, cleanup and cancel call
/// panics until the app is restarted. The data behind these locks is counters,
/// maps and sets, each updated in small steps, so the last state is a better
/// place to carry on from than a dead application. The panic itself is still
/// reported by the panicking thread, and this logs that it was recovered from.
///
/// The cost is that a session whose worker panicked part-way may never settle
/// the job it held, so it never finishes and stays counted as active until the
/// app restarts. That is one stuck scan, against an
/// application where every command panics.
pub(super) fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| {
        crate::logging::warn(
            "scan",
            "a lock was poisoned by a panic on another thread; continuing with its last state",
        );
        mutex.clear_poison();
        poisoned.into_inner()
    })
}

pub(super) fn registry() -> &'static Arc<Mutex<ScanRegistry>> {
    REGISTRY.get_or_init(|| Arc::new(Mutex::new(ScanRegistry::default())))
}

pub(super) fn release_claim(registry: &mut ScanRegistry, target_id: &str) {
    registry.in_flight.remove(target_id);
    registry.cleanup_controls.remove(target_id);
}

pub(super) fn session_can_finish(walk_finished: bool, pending_sizes: usize) -> bool {
    walk_finished && pending_sizes == 0
}

pub(super) fn scan_id_from_target_id(target_id: &str) -> String {
    let mut parts = target_id.splitn(3, '-');
    match (parts.next(), parts.next()) {
        (Some("scan"), Some(number)) => format!("scan-{number}"),
        _ => String::new(),
    }
}
