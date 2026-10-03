use super::load_settings;
use tauri::AppHandle;

/// Registers or removes the login item to match the stored preference.
///
/// Applied at startup as well as on change: the setting is the source of truth
/// and the operating system is what has to follow it, not the other way round.
/// A failure is logged rather than surfaced — the app works either way, and a
/// dialog about a login item is not worth interrupting a launch for.
pub fn apply_autostart(app: &AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let Ok(settings) = load_settings(app) else {
        return;
    };
    let manager = app.autolaunch();
    let result = if settings.open_at_startup {
        manager.enable()
    } else {
        manager.disable()
    };
    if let Err(error) = result {
        crate::logging::warn(
            "autostart",
            &format!("could not apply the login item error=\"{error}\""),
        );
    }
}
