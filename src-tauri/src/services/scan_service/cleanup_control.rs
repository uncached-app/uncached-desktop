//! The state machine that decides whether a cleanup can still be cancelled.

use super::*;

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum CleanupPhase {
    Preparing = 0,
    Executing = 1,
    Finished = 2,
    Cancelled = 3,
}

pub struct CleanupControl {
    pub(super) phase: AtomicU8,
    pub(super) cancel_requested: AtomicBool,
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
