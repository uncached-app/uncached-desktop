//! Living in the menu bar between uses.
//!
//! A disk filling up is not an event the user goes looking for, which makes
//! this the difference between a tool someone remembers to open and one that
//! tells them when there is a reason to. Everything here is that presence: an
//! icon that outlives the window, a close that hides instead of quitting, and a
//! notification that fires only when nobody is already looking.
//!
//! Nothing here scans, decides or deletes. It reports what the scan already
//! found and reopens the window that shows it.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Listener, Manager, WindowEvent};
use tauri_plugin_notification::NotificationExt;

/// Passed by the login item the autostart plugin registers, so a launch the
/// user did not ask for does not put a window in front of them. Starting from
/// the Dock or the Start menu is a request to see the app, and shows it.
pub const MINIMIZED_FLAG: &str = "--minimized";

pub fn starts_hidden() -> bool {
    std::env::args().any(|argument| argument == MINIMIZED_FLAG)
}

fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// Builds the tray icon and its menu.
///
/// The menu is short on purpose. A tray menu is not a second interface: it
/// reopens the app and it quits, and every other decision belongs on a screen
/// where the consequences are visible.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Uncached", true, None::<&str>)?;
    let scan = MenuItem::with_id(app, "scan", "Scan workspace", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Uncached", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&open, &scan, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    TrayIconBuilder::with_id("uncached")
        .icon(app.default_window_icon().cloned().expect("bundled icon"))
        .tooltip("Uncached")
        .menu(&menu)
        // The menu belongs to the right button. A left click reopens the app,
        // which is what a tray icon is for and what every platform expects.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "scan" => {
                show_main_window(app);
                // The window owns the scan. Asking it keeps one path into the
                // flow instead of a second one that skips its state.
                let _ = app.emit("tray://scan", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Hides the window instead of closing it, when the user asked for that.
///
/// Read from settings on every close rather than captured once: a preference
/// changed in this session has to take effect in this session, and a window
/// that refuses to close is the worst possible thing to get wrong.
pub fn intercept_close(app: &AppHandle, event: &WindowEvent) -> bool {
    if !matches!(event, WindowEvent::CloseRequested { .. }) {
        return false;
    }
    let keep_running = crate::commands::settings::load_settings(app)
        .map(|settings| settings.keep_running_in_background)
        .unwrap_or(false);
    if !keep_running {
        return false;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    true
}

/// Notifies when a scan finishes with something to reclaim and nobody is
/// looking.
///
/// The condition is the whole design. A notification about a number already on
/// screen is noise, and noise is how an app loses the right to send any. So it
/// fires only while the window is hidden, and only when the scan actually found
/// something — a run that finds nothing says nothing.
pub fn watch_scans(app: &AppHandle) {
    let handle = app.clone();
    app.listen("scan:finished", move |event| {
        let visible = handle
            .get_webview_window("main")
            .and_then(|window| window.is_visible().ok())
            .unwrap_or(true);
        if visible {
            return;
        }

        let Some((targets, bytes)) = parse_finished(event.payload()) else {
            return;
        };
        if targets == 0 || bytes == 0 {
            return;
        }

        let _ = handle
            .notification()
            .builder()
            .title("Uncached")
            .body(format!(
                "{} {} found, {} reclaimable.",
                targets,
                if targets == 1 { "target" } else { "targets" },
                crate::models::target::format_size(bytes)
            ))
            .show();
    });
}

/// Reads the two numbers the notification needs out of the finished event.
///
/// Tolerant by design: a payload shape this cannot read costs a notification,
/// never a panic in a listener the user cannot see.
fn parse_finished(payload: &str) -> Option<(u64, u64)> {
    let value: serde_json::Value = serde_json::from_str(payload).ok()?;
    let data = value.get("data").unwrap_or(&value);
    Some((
        data.get("totalTargets")?.as_u64()?,
        data.get("totalBytes")?.as_u64()?,
    ))
}

#[cfg(test)]
mod tests {
    use super::parse_finished;

    #[test]
    fn the_finished_event_yields_its_two_numbers() {
        let payload = r#"{"data":{"scanId":"s","totalTargets":12,"totalBytes":4096}}"#;
        assert_eq!(parse_finished(payload), Some((12, 4096)));
    }

    #[test]
    fn an_unreadable_payload_costs_a_notification_and_nothing_else() {
        for payload in ["", "not json", "{}", r#"{"data":{"totalTargets":3}}"#] {
            assert_eq!(parse_finished(payload), None);
        }
    }
}
