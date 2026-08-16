pub mod commands;
pub mod errors;
pub mod filesystem;
pub mod logging;
pub mod menu;
pub mod models;
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
use commands::duplicates::duplicate_packages;
use commands::entitlements::get_entitlement_status;
use commands::git::{fetch_project, project_hygiene, prune_branches, workspace_hygiene};
use commands::history::{cleanup_history, clear_history, record_workspace_visit};
use commands::license::{activate_license, deactivate_license, get_license};
use commands::locate::{available_launchers, open_project_with, restore_project, reveal_project};
use commands::orphans::orphan_artifacts;
use commands::scan::{retry_target_size, start_scan};
use commands::settings::{
    get_app_info, get_settings, review_ignore_rules, starts_hidden, update_settings,
};
use commands::workspace::{
    assess_projects, maintenance_schedule_status, maintenance_targets, measure_project_footprint,
    normalize_workspace_roots, preview_maintenance, scan_workspace_index,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        // The login item launches with `--minimized`, so a start the user did
        // not ask for never puts a window in front of them.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![tray::MINIMIZED_FLAG]),
        ))
        // Verified once, before anything can ask what the plan is. A licence
        // that no longer holds leaves the app on Free rather than refusing to
        // start: losing Pro is recoverable, a window that will not open is not.
        .manage(watch::Watching::default())
        .setup(|app| {
            let handle = app.handle();
            commands::license::install(handle);
            tray::install(handle)?;
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
            record_workspace_visit,
            cleanup_history,
            available_launchers,
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
