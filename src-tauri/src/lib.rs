pub mod commands;
pub mod errors;
pub mod filesystem;
pub mod logging;
pub mod menu;
pub mod models;
mod native_strings;
mod process;
pub mod scanner;
mod scheduler;
pub mod services;
pub mod tray;
pub mod watch;
pub mod workspace;

pub use uncached_core as shared_core;

use tauri::Manager;

use commands::cancel::{cancel_cleanup, cancel_scan};
use commands::clean::clean_target;
use commands::cleanup_capabilities;
use commands::dependencies::unused_dependencies;
use commands::diagnostics::{diagnostic_report, open_log_folder};
use commands::duplicates::duplicate_packages;
use commands::entitlements::get_entitlement_status;
use commands::git::{fetch_project, project_hygiene, prune_branches, workspace_hygiene};
use commands::history::{cleanup_history, clear_history, record_workspace_visit};
use commands::license::{activate_license, deactivate_license, get_license, stored_license_key};
use commands::locate::{available_launchers, open_project_with, restore_project, reveal_project};
use commands::orphans::orphan_artifacts;
use commands::scan::{retry_target_size, start_scan};
use commands::settings::{
    get_app_info, get_settings, review_ignore_rules, starts_hidden, update_settings,
};
use commands::window::set_window_frame;
use commands::workspace::{
    assess_projects, maintenance_schedule_status, maintenance_targets, measure_project_footprint,
    normalize_workspace_roots, preview_maintenance, running_projects, scan_workspace_index,
};

/// The login item, named rather than inherited.
///
/// Left alone the entry takes `package_info().name`, which falls back to the
/// Cargo crate name — so Windows listed it as "uncached", lower case, in a
/// system screen beside every other application spelled the way its makers
/// spell it.
///
/// `macos_launcher` exists only on macOS: the field behind it carries the same
/// `cfg`, so calling it anywhere else does not compile. Shadowed rather than
/// written as two whole builders, so the shared half cannot drift.
fn autostart<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let builder = tauri_plugin_autostart::Builder::new()
        .arg(tray::MINIMIZED_FLAG)
        .app_name("Uncached");

    #[cfg(target_os = "macos")]
    let builder = builder.macos_launcher(tauri_plugin_autostart::MacosLauncher::LaunchAgent);

    builder.build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        // Updates. The check is the frontend's to make, because only it knows
        // whether the user is in the middle of a scan or a cleanup — an app
        // that replaces itself under a running cleanup is the one bug this
        // feature could introduce that matters.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // The login item launches with `--minimized`, so a start the user did
        // not ask for never puts a window in front of them.
        .plugin(autostart())
        // Verified once, before anything can ask what the plan is. A licence
        // that no longer holds leaves the app on Free rather than refusing to
        // start: losing Pro is recoverable, a window that will not open is not.
        .manage(watch::Watching::default())
        .setup(|app| {
            let handle = app.handle();
            commands::license::install(handle);
            tray::install(handle)?;
            tray::hide_dock_on_silent_start(handle);
            tray::watch_scans(handle);
            commands::settings::apply_autostart(handle);
            scheduler::install(handle);
            Ok(())
        })
        // Closing hides rather than quits when the user asked for that, so the
        // tray icon has something to reopen.
        .on_menu_event(|app, event| menu::on_event(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            let handle = window.app_handle().clone();
            if tray::intercept_close(&handle, event) {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            menu::install_menu,
            watch::watch_workspace,
            commands::theme::list_themes,
            commands::theme::reveal_config,
            cancel_scan,
            cancel_cleanup,
            start_scan,
            retry_target_size,
            clean_target,
            cleanup_capabilities,
            get_entitlement_status,
            activate_license,
            deactivate_license,
            get_license,
            stored_license_key,
            record_workspace_visit,
            cleanup_history,
            available_launchers,
            commands::storage::storage_report,
            native_strings::set_native_strings,
            commands::storage::open_full_disk_access,
            reveal_project,
            open_project_with,
            restore_project,
            clear_history,
            get_settings,
            update_settings,
            get_app_info,
            starts_hidden,
            review_ignore_rules,
            scan_workspace_index,
            measure_project_footprint,
            normalize_workspace_roots,
            running_projects,
            set_window_frame,
            assess_projects,
            preview_maintenance,
            maintenance_targets,
            maintenance_schedule_status,
            project_hygiene,
            workspace_hygiene,
            fetch_project,
            prune_branches,
            duplicate_packages,
            orphan_artifacts,
            unused_dependencies,
            diagnostic_report,
            open_log_folder,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        // Built and then run, rather than `run(context)`, only so there is a
        // place to answer this: hiding to the tray leaves the app in the Dock,
        // and clicking a Dock icon is not a window event — macOS asks the
        // application delegate, which reaches us as `Reopen` and nothing else.
        // Without this the icon is there and inert, and the tray is the only
        // way back in.
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            {
                if let tauri::RunEvent::Reopen {
                    has_visible_windows,
                    ..
                } = _event
                {
                    // A visible window means macOS has already done the only
                    // thing being asked for, which is to bring the app forward.
                    if !has_visible_windows {
                        tray::show_main_window(_app);
                    }
                }
            }
        });
}
