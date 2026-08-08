 src-tauri/src/errors/error.rs          |   3 +
 src-tauri/src/services/scan_service.rs | 146 ++++++++++++++++++++++++++++++++-
 2 files changed, 146 insertions(+), 3 deletions(-)
diff --git a/src-tauri/src/errors/error.rs b/src-tauri/src/errors/error.rs
index 36830ae..9409477 100644
--- a/src-tauri/src/errors/error.rs
+++ b/src-tauri/src/errors/error.rs
@@ -20,6 +20,9 @@ pub enum NukeError {
     #[error("Scan cancelled by user")]
     ScanCancelled,
 
+    #[error("Cleanup cancelled before deletion")]
+    CleanupCancelled,
+
     #[error("Internal error: {0}")]
     Internal(String),
 }
diff --git a/src-tauri/src/services/scan_service.rs b/src-tauri/src/services/scan_service.rs
index 7f3d8a6..8ee60a3 100644
--- a/src-tauri/src/services/scan_service.rs
+++ b/src-tauri/src/services/scan_service.rs
@@ -5,7 +5,7 @@ use crate::scanner::get_default_providers;
 use serde::Serialize;
 use std::collections::{HashMap, HashSet};
 use std::path::{Path, PathBuf};
-use std::sync::atomic::{AtomicBool, Ordering};
+use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
 use std::sync::{Arc, Mutex, OnceLock};
 use std::time::Instant;
 use tauri::{AppHandle, Emitter};
@@ -40,6 +40,79 @@ pub struct RegisteredTarget {
     pub providers: Arc<uncached_core::ProviderSet>,
 }
 
+#[repr(u8)]
+#[derive(Clone, Copy, PartialEq, Eq)]
+enum CleanupPhase {
+    Preparing = 0,
+    Executing = 1,
+    Finished = 2,
+    Cancelled = 3,
+}
+
+pub struct CleanupControl {
+    phase: AtomicU8,
+    cancel_requested: AtomicBool,
+}
+
+impl CleanupControl {
+    pub fn new() -> Self {
+        Self {
+            phase: AtomicU8::new(CleanupPhase::Preparing as u8),
+            cancel_requested: AtomicBool::new(false),
+        }
+    }
+
+    pub fn request_cancel(&self) -> bool {
+        if self
+            .phase
+            .compare_exchange(
+                CleanupPhase::Preparing as u8,
+                CleanupPhase::Cancelled as u8,
+                Ordering::AcqRel,
+                Ordering::Acquire,
+            )
+            .is_err()
+        {
+            return false;
+        }
+
+        self.cancel_requested.store(true, Ordering::Release);
+        true
+    }
+
+    pub fn begin_execution(&self) -> bool {
+        if self.cancel_requested.load(Ordering::Acquire) {
+            return false;
+        }
+
+        self.phase
+            .compare_exchange(
+                CleanupPhase::Preparing as u8,
+                CleanupPhase::Executing as u8,
+                Ordering::AcqRel,
+                Ordering::Acquire,
+            )
+            .is_ok()
+    }
+
+    pub fn finish(&self) {
+        self.phase
+            .store(CleanupPhase::Finished as u8, Ordering::Release);
+        self.cancel_requested.store(false, Ordering::Release);
+    }
+
+    pub fn is_cancelled(&self) -> bool {
+        self.cancel_requested.load(Ordering::Acquire)
+            && self.phase.load(Ordering::Acquire) == CleanupPhase::Cancelled as u8
+    }
+}
+
+impl Default for CleanupControl {
+    fn default() -> Self {
+        Self::new()
+    }
+}
+
 #[derive(Default)]
 struct ScanRegistry {
     targets: HashMap<String, RegisteredTarget>,
@@ -457,14 +530,81 @@ fn scan_id_from_target_id(target_id: &str) -> String {
 
 #[cfg(test)]
 mod tests {
-    use super::{providers_for_scan, registry, RegisteredTarget, ScanService, ScanStartResult};
+    use super::{
+        providers_for_scan, registry, CleanupControl, RegisteredTarget, ScanService,
+        ScanStartResult,
+    };
     use crate::commands::settings::AppSettings;
+    use crate::errors::NukeError;
     use crate::models::action::CleanMode;
     use crate::models::category::Category;
     use crate::models::target::ScanTarget;
     use crate::services::clean_service::CleanService;
     use std::path::PathBuf;
-    use std::sync::Arc;
+    use std::sync::{mpsc, Arc, Barrier};
+    use std::thread;
+
+    #[test]
+    fn cleanup_control_cancel_wins_only_during_preparing() {
+        let control = CleanupControl::new();
+
+        assert!(control.request_cancel());
+        assert!(control.is_cancelled());
+        assert!(!control.request_cancel());
+        assert!(!control.begin_execution());
+    }
+
+    #[test]
+    fn cleanup_control_execution_blocks_later_cancel() {
+        let control = CleanupControl::new();
+
+        assert!(control.begin_execution());
+        assert!(!control.request_cancel());
+        assert!(!control.begin_execution());
+        control.finish();
+        assert!(!control.is_cancelled());
+    }
+
+    #[test]
+    fn cleanup_control_cancel_execution_race_has_one_winner() {
+        let control = Arc::new(CleanupControl::new());
+        let barrier = Arc::new(Barrier::new(3));
+        let (sender, receiver) = mpsc::channel();
+
+        let cancel_control = Arc::clone(&control);
+        let cancel_barrier = Arc::clone(&barrier);
+        let cancel_sender = sender.clone();
+        let cancel_thread = thread::spawn(move || {
+            cancel_barrier.wait();
+            cancel_sender.send(cancel_control.request_cancel()).unwrap();
+        });
+
+        let execution_control = Arc::clone(&control);
+        let execution_barrier = Arc::clone(&barrier);
+        let execution_sender = sender;
+        let execution_thread = thread::spawn(move || {
+            execution_barrier.wait();
+            execution_sender
+                .send(execution_control.begin_execution())
+                .unwrap();
+        });
+
+        barrier.wait();
+        let winners = [receiver.recv().unwrap(), receiver.recv().unwrap()];
+
+        cancel_thread.join().unwrap();
+        execution_thread.join().unwrap();
+
+        assert_eq!(winners.iter().filter(|won| **won).count(), 1);
+    }
+
+    #[test]
+    fn cleanup_cancelled_error_describes_pre_execution_cancellation() {
+        assert_eq!(
+            NukeError::CleanupCancelled.to_string(),
+            "Cleanup cancelled before deletion"
+        );
+    }
 
     #[test]
      fn converts_core_target_preserving_scan_fields_and_pending_state() {

## Task 1 Review Follow-up

- Added `assert!(!control.request_cancel())` immediately after `finish()` in `cleanup_control_execution_blocks_later_cancel`.
- Production state machine unchanged.
- `cargo test cleanup_control`: blocked because patched dependency `E:\projetos-pessoais\uncached-core\Cargo.toml` is missing.
- `cargo check`: blocked by the same missing patched dependency.
- `cargo fmt -- --check`: reports pre-existing trailing blank line in `src-tauri/src/commands/mod.rs`; requested file has no reported formatting issue.
- `git diff --check` for source change: passed; staged report retains four pre-existing whitespace-only lines.
