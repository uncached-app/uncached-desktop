use super::{
    error_event, lock, platform, providers_for_scan, registry, scan_failed_event,
    scan_finished_event, target_found_event, target_sized_event, CleanupControl, EventSink,
    RegisteredTarget, ScanService, ScanStartResult, ScanStats, SizingController, SizingJob,
    NEXT_SCAN_ID,
};
use crate::commands::settings::AppSettings;
use crate::errors::NukeError;
use crate::filesystem::size::DirSize;
use crate::models::action::CleanMode;
use crate::models::category::Category;
use crate::models::target::ScanTarget;
use crate::services::clean_service::CleanService;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Barrier, Mutex};
use std::thread;

/// The interface translates a refusal by its code, so the running
/// program has to arrive as data rather than inside an English sentence.
/// One panic must not become a panic in every command after it. Poisoning
/// is what `lock().unwrap()` turned a single failed invariant into.
#[test]
fn lock_carries_on_with_the_last_state_after_a_panic_while_held() {
    let shared = Arc::new(Mutex::new(vec![1, 2, 3]));
    let poisoner = Arc::clone(&shared);
    let _ = thread::spawn(move || {
        let mut guard = poisoner.lock().unwrap();
        guard.push(4);
        panic!("a worker failed while holding the lock");
    })
    .join();
    assert!(shared.is_poisoned(), "the fixture must really be poisoned");

    assert_eq!(*lock(&shared), vec![1, 2, 3, 4]);
    assert!(
        !shared.is_poisoned(),
        "recovered once, not on every later call"
    );
}

/// The case that matters: the registry every scan, cleanup and cancel goes
/// through, poisoned by a panic on another thread.
#[test]
fn the_registry_keeps_answering_after_a_panic_while_it_was_held() {
    let _ = thread::spawn(|| {
        let _guard = registry().lock().unwrap_or_else(|e| e.into_inner());
        panic!("a worker failed while holding the registry");
    })
    .join();

    // Neither of these may panic.
    let _ = ScanService::active_scan_count();
    assert!(ScanService::claim_target_for_cleanup("no-such-target").is_err());
}

#[test]
fn a_target_held_by_a_running_program_is_refused_with_its_name() {
    let info = super::public_error_info(&crate::errors::NukeError::InUse("Xcode".to_owned()));

    assert_eq!(info.code, uncached_core::CoreErrorCode::TargetInUse);
    assert_eq!(info.operation.as_deref(), Some("Xcode"));
    assert_eq!(info.path, None);
}

#[test]
fn target_found_event_serializes_as_v1_without_identity() {
    let target = ScanTarget::new(
        PathBuf::from(r"C:\workspace\node_modules"),
        Category::NodeModules,
        12,
        false,
    );
    let value = serde_json::to_value(target_found_event("scan-1", &target)).unwrap();

    assert_eq!(value["apiVersion"], "v1");
    assert!(value["platform"].is_string());
    assert_eq!(value["data"]["scanId"], "scan-1");
    assert_eq!(value["data"]["target"]["sizeBytes"], 12);
    assert!(value["data"]["target"].get("identity").is_none());
    assert!(value["error"].is_null());
}

// The event payload is hand-built, so a field added to `ScanTarget` does not
// reach the wire on its own. This pins the exact key set the UI validator
// requires: adding a field to the model without adding it here fails loudly
// instead of failing at runtime as a rejected payload.
#[test]
fn target_found_event_carries_every_field_the_ui_contract_requires() {
    for (category, expected_plan) in [
        (Category::NodeModules, "free"),
        (Category::PackageManagerCache, "pro"),
    ] {
        let target = ScanTarget::new(PathBuf::from(r"C:\workspace\artifact"), category, 12, false);
        let value = serde_json::to_value(target_found_event("scan-1", &target)).unwrap();
        let emitted = value["data"]["target"].as_object().unwrap();
        let mut keys = emitted.keys().cloned().collect::<Vec<_>>();
        keys.sort();

        assert_eq!(
            keys,
            [
                "blockedBy",
                "category",
                "cleanable",
                "confidence",
                "formattedSize",
                "id",
                "label",
                "lastUsedAt",
                "name",
                "path",
                "plan",
                "reclaimWith",
                "sizeBytes",
                "sizeHasErrors",
                "sizePending",
            ]
        );
        assert_eq!(emitted["plan"], expected_plan);
        assert!(emitted["confidence"]["level"].is_string());
        assert!(emitted["confidence"]["signals"].is_array());
    }
}

#[test]
fn target_sized_event_serializes_camel_case_v1_data() {
    let update = super::TargetSizeUpdate {
        scan_id: "scan-1".into(),
        target_id: "target-1".into(),
        size_bytes: 42,
        last_used_at: Some(1_700_000_000),
        size_has_errors: true,
        size_pending: false,
        formatted_size: "42 B".into(),
    };
    let value = serde_json::to_value(target_sized_event(&update)).unwrap();

    assert_eq!(value["apiVersion"], "v1");
    assert_eq!(value["data"]["targetId"], "target-1");
    assert_eq!(value["data"]["sizeHasErrors"], true);
    assert_eq!(value["data"]["formattedSize"], "42 B");
    assert!(value["error"].is_null());
}

#[test]
fn scan_finished_event_serializes_settled_totals() {
    let value = serde_json::to_value(scan_finished_event("scan-1", 3, 99, 7, 0)).unwrap();

    assert_eq!(value["apiVersion"], "v1");
    assert_eq!(value["data"]["scanId"], "scan-1");
    assert_eq!(value["data"]["totalTargets"], 3);
    assert_eq!(value["data"]["totalBytesFound"], 99);
    assert_eq!(value["data"]["durationMs"], 7);
    assert_eq!(value["data"]["unreadable"], 0);
    assert!(value["error"].is_null());

    // The case the field exists for: a walk that was refused folders reports
    // how many, so the two totals above it can be read as a floor rather
    // than as the workspace.
    let withheld = serde_json::to_value(scan_finished_event("scan-1", 3, 99, 7, 12)).unwrap();
    assert_eq!(withheld["data"]["unreadable"], 12);
}

#[test]
fn scan_failed_event_has_correlated_v1_data_and_sanitized_error() {
    let value = serde_json::to_value(scan_failed_event(
        "scan-1",
        &NukeError::Io(std::io::Error::other("private native detail")),
    ))
    .unwrap();

    assert_eq!(value["apiVersion"], "v1");
    assert_eq!(value["platform"], serde_json::to_value(platform()).unwrap());
    assert_eq!(value["data"]["scanId"], "scan-1");
    assert_eq!(value["data"]["error"]["code"], "io");
    assert!(value["error"].is_null());
    assert!(!value.to_string().contains("private native detail"));
}

#[test]
fn cleanup_core_error_identity_is_preserved_in_public_info() {
    let cases = [
        uncached_core::CoreError::TargetIdentityChanged {
            path: "target".into(),
        },
        uncached_core::CoreError::TargetIdentityUnavailable {
            path: "target".into(),
        },
        uncached_core::CoreError::TargetReparsePoint {
            path: "target".into(),
        },
        uncached_core::CoreError::SecureTrashUnavailable,
    ];
    let expected = [
        "target_identity_changed",
        "target_identity_unavailable",
        "target_reparse_point",
        "secure_trash_unavailable",
    ];

    for (error, code) in cases.into_iter().zip(expected) {
        let value =
            serde_json::to_value(error_event(&NukeError::Core(error.public_info()))).unwrap();
        assert_eq!(value["error"]["code"], code);
    }
}

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
        last_used_at: None,
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
            errors: 0,
            newest_modified: None,
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

/// Exercises the discovery phase against a home directory built for the
/// test, so the assertions do not depend on which tools this machine has.
/// What matters is that a catalogued location becomes a real registered
/// target: emitted, named after its tool, and rooted at the home directory
/// with a provider set that vouches for it — without which cleanup would
/// refuse it and the finding would be visible but inert.
#[test]
fn discovery_registers_catalogued_locations_as_cleanable_targets() {
    let home = std::env::temp_dir().join(format!("uncached-discovery-home-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&home);
    let location = uncached_core::known_locations()
        .first()
        .expect("the catalogue should not be empty");
    let path = location.resolve(&home);
    std::fs::create_dir_all(&path).unwrap();

    let scan_id = format!("discovery-{}", std::process::id());
    registry()
        .lock()
        .unwrap()
        .sessions
        .insert(scan_id.clone(), super::ScanSession::new());

    let emitted: Arc<Mutex<Vec<serde_json::Value>>> = Arc::new(Mutex::new(Vec::new()));
    let sink_emitted = Arc::clone(&emitted);
    let event_sink: EventSink = Arc::new(move |event, payload| {
        if event == "scan:target_found" {
            sink_emitted.lock().unwrap().push(payload);
        }
    });
    let sizing = SizingController::for_test(
        1,
        Arc::new(|_| DirSize {
            bytes: 0,
            errors: 0,
            newest_modified: None,
        }),
        Arc::clone(&event_sink),
    );

    super::discover_home_locations(
        &super::RunningScan {
            id: &scan_id,
            events: &event_sink,
            stats: &Arc::new(Mutex::new(ScanStats::default())),
            cancel: &Arc::new(AtomicBool::new(false)),
            sizing: &sizing.submitter(),
        },
        &home,
        &crate::scanner::discovery_categories(&crate::commands::settings::AppSettings::default()),
        "",
    );
    sizing.finish();

    // Narrowed to the fixture. Discovery also probes the system temp roots
    // for a coding agent's session scratch, and those belong to the machine
    // running the test rather than to the home directory built for it.
    let events = emitted.lock().unwrap();
    let fixture: Vec<_> = events
        .iter()
        .filter(|event| event["data"]["target"]["label"] == location.label)
        .collect();
    assert_eq!(
        fixture.len(),
        1,
        "one catalogued location exists in the fixture"
    );
    let target = &fixture[0]["data"]["target"];
    assert_eq!(target["label"], location.label);
    // Read from the boundary rather than pinned to a literal: which plan a
    // catalogued location needs is the entitlement module's decision, and
    // this test is about discovery registering the target at all.
    assert_eq!(
        target["plan"],
        serde_json::to_value(crate::commands::entitlements::plan_for_category(
            &location.category
        ))
        .unwrap()
    );

    let target_id = target["id"].as_str().unwrap().to_owned();
    let registered = ScanService::get_target(&target_id).expect("discovery should register");
    // Canonical, which on macOS is `/private/var/...` where the fixture
    // said `/var/...`. That is the point of the field rather than an
    // inconvenience of it: cleanup checks containment against resolved
    // paths, so a root that is not itself resolved contains nothing.
    assert_eq!(
        registered.root_path,
        uncached_core::canonical(&home).unwrap_or_else(|_| home.clone())
    );
    assert!(
        uncached_core::validate_clean_target(
            &registered.root_path,
            &registered.providers,
            &uncached_core::ScanTarget::new(
                registered.target.path.clone(),
                registered.target.category.clone(),
                0,
            )
            .with_identity(registered.target.identity),
        )
        .is_ok(),
        "cleanup must accept a discovered target"
    );

    drop(events);
    ScanService::remove_target(&target_id).unwrap();
    registry().lock().unwrap().sessions.remove(&scan_id);
    let _ = std::fs::remove_dir_all(&home);
}

/// An excluded location is not reported at all, rather than reported and
/// then refused at cleanup. A finding the user cannot act on is worse than
/// no finding: it reads as the app being broken.
#[test]
fn an_ignore_rule_keeps_a_discovery_off_the_list() {
    let home =
        std::env::temp_dir().join(format!("uncached-discovery-ignored-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&home);
    let location = uncached_core::known_locations()
        .first()
        .expect("the catalogue should not be empty");
    std::fs::create_dir_all(location.resolve(&home)).unwrap();

    let scan_id = format!("discovery-ignored-{}", std::process::id());
    registry()
        .lock()
        .unwrap()
        .sessions
        .insert(scan_id.clone(), super::ScanSession::new());

    let emitted: Arc<Mutex<Vec<serde_json::Value>>> = Arc::new(Mutex::new(Vec::new()));
    let sink_emitted = Arc::clone(&emitted);
    let event_sink: EventSink = Arc::new(move |event, payload| {
        if event == "scan:target_found" {
            sink_emitted.lock().unwrap().push(payload);
        }
    });
    let sizing = SizingController::for_test(
        1,
        Arc::new(|_| DirSize {
            bytes: 0,
            errors: 0,
            newest_modified: None,
        }),
        Arc::clone(&event_sink),
    );

    super::discover_home_locations(
        &super::RunningScan {
            id: &scan_id,
            events: &event_sink,
            stats: &Arc::new(Mutex::new(ScanStats::default())),
            cancel: &Arc::new(AtomicBool::new(false)),
            sizing: &sizing.submitter(),
        },
        &home,
        &crate::scanner::discovery_categories(&crate::commands::settings::AppSettings::default()),
        &location.resolve(&home).to_string_lossy(),
    );
    sizing.finish();

    assert!(
        !emitted
            .lock()
            .unwrap()
            .iter()
            .any(|event| event["data"]["target"]["label"] == location.label),
        "an excluded location must not be reported"
    );

    registry().lock().unwrap().sessions.remove(&scan_id);
    let _ = std::fs::remove_dir_all(&home);
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
            newest_modified: None,
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
            errors: 0,
            newest_modified: None,
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

    assert!(providers.len() > uncached_core::ProviderSet::free().len());
    assert!(providers
        .scanner_for(&uncached_core::Category::CargoTarget)
        .is_some());
    assert!(providers
        .scanner_for(&uncached_core::Category::NodeModules)
        .is_some());
    assert!(uncached_core::ProviderSet::free()
        .scanner_for(&uncached_core::Category::CargoTarget)
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

    // The snapshot has to be the set this scan ran with, not whatever the
    // settings say later. Ignore rules are now the only thing that shapes
    // it, so an excluded path is what proves the set travelled with the
    // target rather than being rebuilt at cleanup time.
    let settings = AppSettings {
        ignore_rules: "/never/touch/this".to_string(),
        ..AppSettings::default()
    };
    let providers = std::sync::Arc::new(providers_for_scan(&settings));
    let mut target = ScanTarget::new(target_path.clone(), Category::NodeModules, 0, false);
    target.identity = uncached_core::filesystem::file_identity(&target_path);
    let registered = RegisteredTarget {
        target,
        root_path: root.clone(),
        providers: std::sync::Arc::clone(&providers),
        owner: &[],
    };

    assert!(
        registered
            .providers
            .excludes(std::path::Path::new("/never/touch/this")),
        "the rules in force at scan time travel with the target"
    );
    assert!(registered
        .providers
        .scanner_for(&uncached_core::Category::NodeModules)
        .is_some());
    let cleanup_result = CleanService::clean_registered_target(
        registered,
        Arc::new(CleanupControl::new()),
        None,
        CleanMode::Permanent,
        Some("Nuke".to_string()),
    );
    assert!(cleanup_result.is_ok(), "cleanup failed: {cleanup_result:?}");
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
    );
    registry().lock().unwrap().targets.insert(
        target_id.clone(),
        RegisteredTarget {
            target,
            root_path: PathBuf::from("C:\\workspace"),
            providers: Arc::new(providers_for_scan(&AppSettings::default())),
            owner: &[],
        },
    );

    let first = ScanService::get_target(&target_id).unwrap();
    let second = ScanService::get_target(&target_id).unwrap();
    assert_eq!(first.target.path, second.target.path);

    ScanService::remove_target(&target_id).unwrap();
}

/// The reason the maintenance run asks Rust which targets belong to a
/// selected project: two different directories share the spelling, and only
/// one of them was selected. A string prefix would hand `/w/api-old` to a
/// run the user authorised for `/w/api`.
#[test]
fn a_shared_prefix_is_not_containment() {
    let prefix = format!("maintenance-scope-{}", std::process::id());
    let paths = [
        PathBuf::from("/w/api/node_modules"),
        PathBuf::from("/w/api-old/node_modules"),
        PathBuf::from("/w/other/node_modules"),
    ];
    let ids: Vec<String> = paths
        .iter()
        .enumerate()
        .map(|(index, path)| {
            let id = format!("{prefix}-{index}");
            registry().lock().unwrap().targets.insert(
                id.clone(),
                RegisteredTarget {
                    target: ScanTarget::new(path.clone(), Category::NodeModules, 1, false),
                    root_path: PathBuf::from("/w"),
                    providers: Arc::new(providers_for_scan(&AppSettings::default())),
                    owner: &[],
                },
            );
            id
        })
        .collect();

    let found = ScanService::targets_under(&[PathBuf::from("/w/api")]);
    let mine: Vec<&String> = found.iter().filter(|id| id.starts_with(&prefix)).collect();

    assert_eq!(mine, vec![&ids[0]], "only the selected project's target");

    for id in ids {
        registry().lock().unwrap().targets.remove(&id);
    }
}

/// `claim_target_for_cleanup` refuses both of these, so handing them back
/// would be promising work the run cannot do.
#[test]
fn a_target_that_cannot_be_cleaned_is_never_offered_to_a_run() {
    let prefix = format!("maintenance-unready-{}", std::process::id());
    let mut pending = ScanTarget::new(
        PathBuf::from("/m/project/node_modules"),
        Category::NodeModules,
        0,
        false,
    );
    pending.size_pending = true;
    let mut unreadable = ScanTarget::new(
        PathBuf::from("/m/project/target"),
        Category::CargoTarget,
        1,
        true,
    );
    unreadable.size_has_errors = true;
    let mut reportable = ScanTarget::new(
        PathBuf::from("/m/project/.venv"),
        Category::NodeModules,
        1,
        false,
    );
    reportable.cleanable = false;

    for (index, target) in [pending, unreadable, reportable].into_iter().enumerate() {
        registry().lock().unwrap().targets.insert(
            format!("{prefix}-{index}"),
            RegisteredTarget {
                target,
                root_path: PathBuf::from("/m"),
                providers: Arc::new(providers_for_scan(&AppSettings::default())),
                owner: &[],
            },
        );
    }

    let found = ScanService::targets_under(&[PathBuf::from("/m/project")]);
    assert!(found.iter().all(|id| !id.starts_with(&prefix)), "{found:?}");

    for index in 0..3 {
        registry()
            .lock()
            .unwrap()
            .targets
            .remove(&format!("{prefix}-{index}"));
    }
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
            newest_modified: None,
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
    );
    registry().lock().unwrap().targets.insert(
        target_id.clone(),
        RegisteredTarget {
            target,
            root_path: PathBuf::from("C:\\workspace"),
            providers: Arc::new(providers_for_scan(&AppSettings::default())),
            owner: &[],
        },
    );

    ScanService::claim_target_for_cleanup(&target_id).unwrap();
    assert!(ScanService::claim_target_for_cleanup(&target_id).is_err());
    ScanService::release_cleanup(&target_id);
    ScanService::claim_target_for_cleanup(&target_id).unwrap();
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
    );
    target.size_pending = true;
    registry().lock().unwrap().targets.insert(
        target_id.clone(),
        RegisteredTarget {
            target,
            root_path: PathBuf::from("C:\\workspace"),
            providers: Arc::new(providers_for_scan(&AppSettings::default())),
            owner: &[],
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
    );
    registry().lock().unwrap().targets.insert(
        target_id.clone(),
        RegisteredTarget {
            target,
            root_path: PathBuf::from("C:\\workspace"),
            providers: Arc::new(providers_for_scan(&AppSettings::default())),
            owner: &[],
        },
    );

    assert!(ScanService::claim_target_for_cleanup(&target_id).is_err());
    ScanService::remove_target(&target_id).unwrap();
}

#[test]
fn release_cleanup_clears_active_cleanup_control() {
    let target_id = format!("release-cleanup-{}", std::process::id());
    insert_test_target(&target_id);

    ScanService::claim_target_for_cleanup(&target_id).unwrap();
    ScanService::release_cleanup(&target_id);

    assert!(!ScanService::cancel_cleanup(&target_id).unwrap().cancelled);
    ScanService::remove_target(&target_id).unwrap();
}

#[test]
fn finish_cleanup_clears_active_cleanup_control_and_removes_the_target() {
    let target_id = format!("finish-cleanup-{}", std::process::id());
    insert_test_target(&target_id);

    ScanService::claim_target_for_cleanup(&target_id).unwrap();
    ScanService::finish_cleanup(&target_id);

    assert!(!ScanService::cancel_cleanup(&target_id).unwrap().cancelled);
    assert!(ScanService::get_target(&target_id).is_err());
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
    );
    registry().lock().unwrap().targets.insert(
        target_id.to_string(),
        RegisteredTarget {
            target,
            root_path: PathBuf::from("C:\\workspace"),
            providers: Arc::new(providers_for_scan(&AppSettings::default())),
            owner: &[],
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
    );
    registry().lock().unwrap().targets.insert(
        target_id.clone(),
        RegisteredTarget {
            target,
            root_path: PathBuf::from("C:\\workspace"),
            providers: Arc::new(providers_for_scan(&AppSettings::default())),
            owner: &[],
        },
    );

    let (registered, _) = ScanService::claim_target_for_cleanup(&target_id).unwrap();
    assert!(CleanService::clean_registered_target(
        registered,
        Arc::new(CleanupControl::new()),
        Some(&crate::commands::settings::AppSettings::default()),
        CleanMode::Trash,
        None,
    )
    .is_err());
    ScanService::release_cleanup(&target_id);
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
            owner: &[],
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
    assert!(ScanService::claim_target_for_cleanup(&target_id).is_err());
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
            newest_modified: None,
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
    assert_eq!(events[0].1["data"]["target"]["sizePending"], true);
    assert_eq!(events[1].1["data"]["sizeBytes"], 7);
    assert_eq!(events[2].1["data"]["totalBytesFound"], 7);
    assert_eq!(events[3].1["data"]["totalBytesFound"], 7);
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
            newest_modified: None,
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
            newest_modified: None,
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
            .1["data"]["totalBytesFound"],
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
            newest_modified: None,
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
fn cancelled_worker_cannot_emit_events_while_publication_barrier_keeps_session_alive() {
    let scan_id = format!(
        "scan-controller-cancel-barrier-{}",
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
    let cancel_token = Arc::clone(&session.cancel_token);
    registry()
        .lock()
        .unwrap()
        .sessions
        .insert(scan_id.clone(), session);

    let (calculator_started_sender, calculator_started_receiver) = mpsc::channel();
    let calculator_calls = Arc::new(AtomicUsize::new(0));
    let calculator_calls_for_worker = Arc::clone(&calculator_calls);
    let (calculator_release_sender, calculator_release_receiver) = mpsc::channel();
    let calculator_release_receiver = Arc::new(std::sync::Mutex::new(calculator_release_receiver));
    let calculator = Arc::new(move |_: &std::path::Path| {
        let call = calculator_calls_for_worker.fetch_add(1, Ordering::AcqRel);
        calculator_started_sender.send(()).unwrap();
        if call == 1 {
            calculator_release_receiver.lock().unwrap().recv().unwrap();
        }
        DirSize {
            bytes: 9,
            errors: 0,
            newest_modified: None,
        }
    });
    let (publication_started_sender, publication_started_receiver) = mpsc::channel();
    let (publication_release_sender, publication_release_receiver) = mpsc::channel();
    let publication_release_receiver =
        Arc::new(std::sync::Mutex::new(publication_release_receiver));
    let events = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let events_for_sink = Arc::clone(&events);
    let sink: super::EventSink = Arc::new(move |event: &str, _: serde_json::Value| {
        events_for_sink.lock().unwrap().push(event.to_string());
        if event == "scan:target_sized" {
            publication_started_sender.send(()).unwrap();
            publication_release_receiver.lock().unwrap().recv().unwrap();
        }
    });
    let controller =
        SizingController::for_test_with_cancel(2, calculator, sink, Arc::clone(&cancel_token));
    let submitter = controller.submitter();
    for target_id in [&first_target_id, &second_target_id] {
        assert!(submitter.submit(SizingJob {
            scan_id: scan_id.clone(),
            target_id: target_id.to_string(),
            path: PathBuf::from("C:\\workspace"),
        }));
    }
    calculator_started_receiver.recv().unwrap();
    calculator_started_receiver.recv().unwrap();
    publication_started_receiver.recv().unwrap();

    assert!(ScanService::cancel_scan(&scan_id).unwrap().cancelled);
    let event_count_at_cancel = events.lock().unwrap().len();
    calculator_release_sender.send(()).unwrap();
    publication_release_sender.send(()).unwrap();
    drop(submitter);
    controller.finish();

    let events = events.lock().unwrap();
    assert_eq!(&events[..event_count_at_cancel], &["scan:target_sized"]);
    assert!(events[event_count_at_cancel..].is_empty());
    assert!(ScanService::get_target(&first_target_id).is_err());
    assert!(ScanService::get_target(&second_target_id).is_err());
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
            newest_modified: None,
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
            newest_modified: None,
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

#[test]
fn the_first_progress_report_always_goes_out() {
    let mut throttle = super::ProgressThrottle::new(std::time::Duration::from_millis(100));
    assert!(throttle.ready_at(std::time::Instant::now()));
}

#[test]
fn progress_inside_the_interval_is_dropped_and_after_it_goes_out() {
    let interval = std::time::Duration::from_millis(100);
    let start = std::time::Instant::now();
    let mut throttle = super::ProgressThrottle::new(interval);

    assert!(throttle.ready_at(start));
    assert!(!throttle.ready_at(start + std::time::Duration::from_millis(1)));
    assert!(!throttle.ready_at(start + std::time::Duration::from_millis(99)));
    assert!(throttle.ready_at(start + interval));
}

/// The window restarts from the report that was let through. Measured from
/// the last *call* instead, a stream faster than the interval would never be
/// let through again after the first report.
#[test]
fn a_steady_fast_stream_is_sampled_at_the_interval_not_starved() {
    let interval = std::time::Duration::from_millis(100);
    let start = std::time::Instant::now();
    let mut throttle = super::ProgressThrottle::new(interval);

    let sent = (0..1000u64)
        .filter(|tick| throttle.ready_at(start + std::time::Duration::from_millis(*tick)))
        .count();

    // 1000 ms of one-per-millisecond reports: one at 0, then every 100 ms.
    assert_eq!(sent, 10);
}
