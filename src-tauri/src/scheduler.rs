//! The thread that runs maintenance with nobody present.
//!
//! Every decision it obeys was made somewhere testable: whether it is time in
//! `workspace::schedule`, which projects qualify in `workspace::maintenance`,
//! and whether a particular directory may be removed in `uncached-core`. What
//! is left here is sequencing and reporting — deliberately, because this is the
//! one part of the product with no user watching it and no test that can
//! observe it in place.
//!
//! Three properties hold whatever else changes:
//!
//!   - **it goes through the same door.** Removal is `commands::clean::
//!     perform_clean`, the function the button calls, which re-checks the
//!     licence, re-validates the target against its providers and its recorded
//!     identity, and appends to the history. There is no second delete path;
//!   - **it always uses the Trash.** Permanent removal takes a typed
//!     confirmation, and there is nobody here to type it. An unattended run that
//!     could delete permanently is a different product;
//!   - **every run is recorded**, including the ones that removed nothing. The
//!     log is what answers "I did not do that", and it can only answer it if it
//!     was written when nobody asked.

use crate::models::action::{CleanMode, CleanRequest, CleanupTrigger};
use crate::services::scan_service::ScanService;
use crate::settings::AppSettings;
use crate::workspace::schedule::{self, Conditions, Due};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Listener};
use tauri_plugin_notification::NotificationExt;

/// How often the schedule is examined — not how often it runs.
///
/// The interval the user chose is measured in days and lives in settings; this
/// is only how long a machine that was asleep, or unlicensed, or busy with the
/// user's own scan, waits before asking again.
const TICK: Duration = Duration::from_secs(15 * 60);

/// Nothing happens for this long after launch.
///
/// A scan competing with the app's own startup is the worst possible first
/// impression, and a machine that has just been woken has other things to do.
/// It also covers the ordinary case of someone opening the app, working for a
/// minute and closing it — that session never triggers a background scan.
const STARTUP_GRACE: Duration = Duration::from_secs(5 * 60);

/// How long a run waits for its scan before giving up on it.
///
/// A ceiling rather than an expectation: the walk reports back through events,
/// and an event that never arrives — a scan that panicked, a sizing worker
/// wedged on a network volume — would otherwise park this thread until the
/// process ends and silently stop maintenance for good.
const SCAN_TIMEOUT: Duration = Duration::from_secs(30 * 60);

/// Set while a run is in progress, so a tick and the tray's Run Now never
/// overlap: two runs would scan the same folders and claim the same targets.
static RUNNING: AtomicBool = AtomicBool::new(false);

/// Clears `RUNNING` on every way out of a run, including an early return.
struct RunGuard;

impl Drop for RunGuard {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::SeqCst);
    }
}

/// Starts the schedule watcher. Called once, from `setup`.
pub fn install(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(STARTUP_GRACE);
        loop {
            tick(&handle);
            std::thread::sleep(TICK);
        }
    });
}

/// One examination of the schedule.
fn tick(app: &AppHandle) {
    // The tray shows free space, which only changes between its rebuilds.
    crate::tray::relabel(app);

    let settings = match crate::settings::load_settings(app) {
        Ok(settings) => settings,
        // A settings file that cannot be read is not a reason to guess at a
        // policy and start deleting under defaults.
        Err(error) => {
            crate::logging::warn(
                "schedule",
                &format!("settings unreadable, holding error=\"{error}\""),
            );
            return;
        }
    };

    let now = chrono::Utc::now().timestamp();
    crate::digest::tick(app, &settings, now);
    let conditions = Conditions {
        schedule: settings.maintenance_schedule,
        pro_enabled: crate::commands::entitlements::current_status().pro_enabled,
        has_workspace: !settings.workspace_roots.is_empty(),
        scan_in_progress: ScanService::active_scan_count() > 0,
        last_run_at: settings.maintenance_last_run_at,
        now,
        free_bytes: least_free_bytes(&settings.workspace_roots),
    };

    match schedule::due(&conditions) {
        Due::Held(held) => {
            // Not logged for the ordinary case. The overwhelming majority of
            // ticks on the overwhelming majority of installs are `Disabled`, and
            // a log that repeats it every fifteen minutes buries the lines that
            // matter.
            if !matches!(
                held,
                schedule::Held::Disabled | schedule::Held::TooSoon | schedule::Held::NotLicensed
            ) {
                crate::logging::info("schedule", &format!("held reason=\"{held:?}\""));
            }
        }
        Due::Now => {
            if schedule::low_on_space(&conditions) {
                crate::logging::info(
                    "schedule",
                    &format!(
                        "low on space free_bytes={}",
                        conditions.free_bytes.unwrap_or(0)
                    ),
                );
            }
            // Stamped before the work, not after. A run that takes the process
            // down with it — or a machine that loses power mid-scan — must not
            // come back and immediately attempt the same thing again. The cost
            // of stamping early is one skipped interval; of stamping late, a
            // loop that scans the disk forever.
            if let Err(error) = crate::settings::record_maintenance_run(app, now) {
                crate::logging::warn(
                    "schedule",
                    &format!("could not stamp the run, holding error=\"{error}\""),
                );
                return;
            }
            run(app, &settings);
        }
    }
}

/// Free bytes on the fullest volume holding a workspace root: cleaning frees
/// space on the workspace's disk, which need not be the one holding home.
pub(crate) fn least_free_bytes(roots: &[String]) -> Option<u64> {
    roots
        .iter()
        .filter_map(|root| crate::filesystem::volume::report_for(std::path::Path::new(root)))
        .map(|report| report.free_bytes)
        .min()
}

/// Runs the policy now, for the tray: the gates of a tick except the clock.
pub fn run_now(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        let Ok(settings) = crate::settings::load_settings(&handle) else {
            return;
        };
        let pro_enabled = crate::commands::entitlements::current_status().pro_enabled;
        if !pro_enabled
            || settings.workspace_roots.is_empty()
            || ScanService::active_scan_count() > 0
        {
            crate::logging::info("schedule", "run now declined");
            return;
        }
        let now = chrono::Utc::now().timestamp();
        if let Err(error) = crate::settings::record_maintenance_run(&handle, now) {
            crate::logging::warn(
                "schedule",
                &format!("could not stamp the run, holding error=\"{error}\""),
            );
            return;
        }
        run(&handle, &settings);
    });
}

/// One run, unless another is in progress.
fn run(app: &AppHandle, settings: &AppSettings) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        crate::logging::info("schedule", "a run is already in progress, skipping");
        return;
    }
    let _guard = RunGuard;
    perform(app, settings);
    crate::tray::relabel(app);
}

/// What one run does, start to finish.
fn perform(app: &AppHandle, settings: &AppSettings) {
    crate::logging::info(
        "schedule",
        &format!("run started roots={}", settings.workspace_roots.len()),
    );

    let candidates =
        match crate::commands::workspace::candidates_for(&settings.workspace_roots, settings) {
            Ok(candidates) => candidates,
            Err(error) => {
                crate::logging::warn("schedule", &format!("index failed error=\"{error}\""));
                return;
            }
        };

    let preview = crate::workspace::maintenance::select(&candidates, &settings.maintenance);
    if preview.selected.is_empty() {
        crate::logging::info(
            "schedule",
            &format!(
                "run selected nothing candidates={} skipped={}",
                candidates.len(),
                preview.skipped.len()
            ),
        );
        return;
    }

    let selected: Vec<PathBuf> = preview
        .selected
        .iter()
        .map(|entry| PathBuf::from(&entry.path))
        .collect();

    // Asked again, because the answer at the top of the tick is stale by now:
    // measuring every project takes minutes, and a user who opened the app and
    // pressed Scan during them would otherwise get a second session over the
    // same folders. Yielding is free — the next tick is fifteen minutes away and
    // the interval is measured in days.
    if ScanService::active_scan_count() > 0 {
        crate::logging::info("schedule", "a scan started while measuring, yielding");
        return;
    }

    // The registry is what authorises a deletion, and it is only filled by a
    // scan. So the run performs one — the same scan the button performs — and
    // waits for it before asking which targets it may claim.
    let Some(scan_id) = scan_and_wait(app, &settings.workspace_roots) else {
        return;
    };
    crate::logging::info("schedule", &format!("scan settled scanId=\"{scan_id}\""));

    let targets = ScanService::targets_under(&selected);
    let mut freed = 0u64;
    let mut removed = 0usize;
    let mut failed = 0usize;

    for target_id in targets {
        let envelope = tauri::async_runtime::block_on(crate::commands::clean::perform_clean(
            app,
            CleanRequest {
                target_id: target_id.clone(),
                // Never `Permanent`. That mode requires a typed confirmation and
                // there is nobody here to type it.
                mode: CleanMode::Trash,
                confirmation: None,
                // The whole reason this variant exists.
                trigger: CleanupTrigger::Scheduled,
            },
        ));

        match envelope.data() {
            Some(result) => {
                removed += 1;
                freed = freed.saturating_add(result.freed_bytes);
            }
            None => {
                failed += 1;
                crate::logging::warn(
                    "schedule",
                    &format!("target refused targetId=\"{target_id}\""),
                );
            }
        }
    }

    crate::logging::info(
        "schedule",
        &format!(
            "run finished projects={} removed={} failed={} bytes={}",
            preview.selected.len(),
            removed,
            failed,
            freed
        ),
    );
    announce(app, preview.selected.len(), freed);
}

/// Starts a scan and blocks until it settles, or the ceiling is reached.
///
/// The three terminal events are all waited on. Waiting only for `scan:finished`
/// would park this thread for the timeout every time a scan failed or was
/// cancelled — including when the user cancels it themselves, which is the most
/// likely way it ends.
fn scan_and_wait(app: &AppHandle, roots: &[String]) -> Option<String> {
    let paths: Vec<PathBuf> = roots.iter().map(PathBuf::from).collect();

    // Listening before starting: a scan over an empty folder can settle before
    // `start_scan` has returned its id, and a listener attached afterwards would
    // wait out the whole timeout for an event that already fired.
    let (sender, receiver) = mpsc::channel::<String>();
    let handles: Vec<_> = ["scan:finished", "scan:cancelled", "scan:failed"]
        .into_iter()
        .map(|event| {
            let sender = sender.clone();
            app.listen(event, move |received| {
                let _ = sender.send(received.payload().to_owned());
            })
        })
        .collect();
    drop(sender);

    let started = ScanService::start_scan(app, &paths);
    let scan_id = match started {
        Ok(result) => result.scan_id,
        Err(error) => {
            crate::logging::warn("schedule", &format!("scan refused error=\"{error}\""));
            for handle in handles {
                app.unlisten(handle);
            }
            return None;
        }
    };

    // Events from a scan the user started in the meantime arrive here too, so
    // each one is matched against the id this run was given before it counts.
    let deadline = std::time::Instant::now() + SCAN_TIMEOUT;
    let settled = loop {
        let Some(remaining) = deadline.checked_duration_since(std::time::Instant::now()) else {
            break false;
        };
        match receiver.recv_timeout(remaining) {
            Ok(payload) if payload.contains(&scan_id) => break true,
            Ok(_) => continue,
            Err(_) => break false,
        }
    };

    for handle in handles {
        app.unlisten(handle);
    }

    if !settled {
        crate::logging::warn(
            "schedule",
            &format!("scan did not settle within the ceiling scanId=\"{scan_id}\""),
        );
        let _ = ScanService::cancel_scan(&scan_id);
        return None;
    }
    Some(scan_id)
}

/// Tells the user what happened while they were not looking.
///
/// Not optional and not a setting. Something removed files from this machine
/// without being asked at that moment, and the person it belongs to finds out
/// the same day rather than from a disk graph a month later. A run that removed
/// nothing says nothing: that is the schedule working, not news.
fn announce(app: &AppHandle, projects: usize, freed: u64) {
    if freed == 0 {
        return;
    }
    let strings = crate::native_strings::current();
    let size = crate::native_strings::localized_size(freed, &strings);
    let _ = app
        .notification()
        .builder()
        .title(&strings.maintenance_title)
        .body(crate::native_strings::render(
            &strings.maintenance_body,
            &strings.locale,
            projects as u64,
            &size,
        ))
        .show();
}
