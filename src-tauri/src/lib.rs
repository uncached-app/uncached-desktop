pub mod commands;
pub mod errors;
pub mod filesystem;
pub mod logging;
pub mod models;
pub mod scanner;
pub mod services;
pub mod tray;
pub mod workspace;

pub use uncached_core as shared_core;

use tauri::Manager;

use commands::cancel::{cancel_cleanup, cancel_scan};
use commands::clean::clean_target;
use commands::cleanup_capabilities;
use commands::entitlements::get_entitlement_status;
use commands::history::{cleanup_history, clear_history, record_workspace_visit};
use commands::license::{activate_license, deactivate_license, get_license};
use commands::scan::{retry_target_size, start_scan};
use commands::settings::{get_app_info, get_settings, review_ignore_rules, starts_hidden, update_settings};
use commands::workspace::{
    assess_project, measure_project_footprint, normalize_workspace_roots, scan_workspace_index,
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
        .setup(|app| {
            let handle = app.handle();
            commands::license::install(handle);
            tray::install(handle)?;
            tray::watch_scans(handle);
            commands::settings::apply_autostart(handle);
            Ok(())
        })
        // Closing hides rather than quits when the user asked for that, so the
        // tray icon has something to reopen.
        .on_window_event(|window, event| {
            let handle = window.app_handle().clone();
            if tray::intercept_close(&handle, event) {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
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
            clear_history,
            get_settings,
            update_settings,
            get_app_info,
            starts_hidden,
            review_ignore_rules,
            scan_workspace_index,
            measure_project_footprint,
            normalize_workspace_roots,
            assess_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
