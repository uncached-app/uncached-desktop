use tauri::Manager;

#[tauri::command]
pub async fn close_splashscreen(app: tauri::AppHandle) {
    if let Some(splashscreen) = app.get_webview_window("splashscreen") {
        let _ = splashscreen.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

#[tauri::command]
pub async fn minimize_splashscreen(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub async fn toggle_maximize_splashscreen(window: tauri::Window) {
    if let Ok(maximized) = window.is_maximized() {
        if maximized {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
pub async fn close_app(app: tauri::AppHandle) {
    app.exit(0);
}
