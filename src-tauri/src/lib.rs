pub mod commands;
pub mod errors;
pub mod filesystem;
pub mod logging;
pub mod models;
pub mod scanner;
pub mod services;

pub use uncached_core as shared_core;

use commands::cancel::{cancel_cleanup, cancel_scan};
use commands::clean::clean_target;
use commands::cleanup_capabilities;
use commands::scan::{retry_target_size, start_scan};
use commands::settings::{get_app_info, get_settings, update_settings};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            cancel_scan,
            cancel_cleanup,
            start_scan,
            retry_target_size,
            clean_target,
            cleanup_capabilities,
            get_settings,
            update_settings,
            get_app_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
