pub mod cleaner;
pub mod commands;
pub mod errors;
pub mod filesystem;
pub mod logging;
pub mod models;
pub mod scanner;
pub mod services;

use commands::cancel::cancel_scan;
use commands::clean::clean_target;
use commands::scan::{retry_target_size, start_scan};
use commands::settings::get_settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            cancel_scan,
            start_scan,
            retry_target_size,
            clean_target,
            get_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
