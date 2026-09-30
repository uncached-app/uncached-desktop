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

use std::sync::RwLock;
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

/// The menu bar wants a monochrome mark it can invert; a taskbar wants the
/// app's own icon. Two different conventions, and following the wrong one looks
/// broken on both.
fn tray_icon(app: &AppHandle) -> tauri::image::Image<'static> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        // Only the alpha channel survives template rendering, so this asset is
        // the brand mark as a silhouette rather than as artwork.
        tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))
            .expect("tray template icon")
    }
    #[cfg(not(target_os = "macos"))]
    {
        // `to_owned` rather than `cloned` alone: `default_window_icon` borrows
        // from the handle, and a clone of a borrow keeps that lifetime. The
        // tray outlives the call, so the icon has to stop borrowing.
        app.default_window_icon()
            .cloned()
            .expect("bundled icon")
            .to_owned()
    }
}

/// Whether the app holds a Dock tile.
///
/// Closing hid the window and left the tile behind, so an app that had been put
/// away was still occupying the Dock — with nothing to click it back open with,
/// because the icon of a hidden app opens nothing. Two places to reopen from and
/// only one of them working is exactly the split `show_main_window` exists to
/// avoid.
///
/// macOS only, and deliberately so. On Windows and Linux hiding a window already
/// takes it out of the taskbar; there is nothing left to withdraw.
///
/// This is not ⌘H. Hide is the system putting a running app aside and it keeps
/// its tile, which is the platform's behaviour and not ours to reinterpret.
fn set_dock_visible(app: &AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_dock_visibility(visible);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, visible);
    }
}

/// Puts the window back in front, from wherever the user asked for it.
///
/// Every way back into a hidden app goes through here — the tray icon, the tray
/// menu, and the Dock. They have to agree: an app that reopens from one of them
/// and ignores another is an app the user has to learn the working half of.
pub fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    // Before the window, not after. The tile is what the window is restored
    // into, and asking for focus while the app is still an accessory gives the
    // key window to whatever was in front.
    set_dock_visible(app, true);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// Takes the app out of the Dock, for a start nobody watched.
///
/// The login item launches with `--minimized` and the window is never shown, so
/// a tile would announce an app the user did not open and cannot open by
/// clicking it.
pub fn hide_dock_on_silent_start(app: &AppHandle) {
    if starts_hidden() {
        set_dock_visible(app, false);
    }
}

const TRAY_ID: &str = "uncached";

/// Reclaimable bytes across the workspace, as the window last measured them.
static RECLAIMABLE: RwLock<Option<u64>> = RwLock::new(None);

/// Free space where cleaning would free it: the workspace's disk, or home's
/// when no folder is chosen.
fn free_bytes(roots: &[String]) -> Option<u64> {
    if roots.is_empty() {
        return crate::filesystem::volume::report_for(&uncached_core::home_directory()?)
            .map(|report| report.free_bytes);
    }
    crate::scheduler::least_free_bytes(roots)
}

fn tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let strings = crate::native_strings::current();
    let settings = crate::commands::settings::load_settings(app).unwrap_or_default();
    let size = |bytes: u64| crate::native_strings::localized_size(bytes, &strings);
    let fill = |template: &str, bytes: u64| {
        crate::native_strings::fill_size(template, &strings.locale, &size(bytes))
    };

    let mut status = Vec::new();
    if let Some(bytes) = free_bytes(&settings.workspace_roots) {
        status.push(MenuItem::with_id(
            app,
            "free",
            fill(&strings.tray_free, bytes),
            false,
            None::<&str>,
        )?);
    }
    if let Some(bytes) = RECLAIMABLE.read().ok().and_then(|guard| *guard) {
        status.push(MenuItem::with_id(
            app,
            "reclaimable",
            fill(&strings.tray_reclaimable, bytes),
            false,
            None::<&str>,
        )?);
    }

    let open = MenuItem::with_id(app, "open", &strings.tray_open, true, None::<&str>)?;
    let scan = MenuItem::with_id(app, "scan", &strings.tray_scan, true, None::<&str>)?;
    let maintenance = (crate::commands::entitlements::current_status().pro_enabled
        && !settings.workspace_roots.is_empty())
    .then(|| {
        MenuItem::with_id(
            app,
            "maintenance",
            &strings.tray_run_maintenance,
            true,
            None::<&str>,
        )
    })
    .transpose()?;
    let quit = MenuItem::with_id(app, "quit", &strings.tray_quit, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let closing = PredefinedMenuItem::separator(app)?;

    let mut items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = Vec::new();
    for item in &status {
        items.push(item);
    }
    if !status.is_empty() {
        items.push(&separator);
    }
    items.push(&open);
    items.push(&scan);
    if let Some(item) = &maintenance {
        items.push(item);
    }
    items.push(&closing);
    items.push(&quit);
    Menu::with_items(app, &items)
}

/// What the window measured as reclaimable, for the tray to show. `None`
/// until a workspace has been measured.
#[tauri::command]
pub fn set_tray_summary(app: AppHandle, reclaimable_bytes: Option<u64>) {
    if let Ok(mut guard) = RECLAIMABLE.write() {
        *guard = reclaimable_bytes;
    }
    relabel(&app);
}

/// Rebuilds the tray menu in the current interface language.
///
/// A native menu holds its titles; it does not re-read them.
pub fn relabel(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = tray_menu(app) {
        let _ = tray.set_menu(Some(menu));
    }
}

/// Builds the tray icon and its menu.
///
/// The menu is short on purpose. A tray menu is not a second interface: it
/// reopens the app and it quits, and every other decision belongs on a screen
/// where the consequences are visible.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let menu = tray_menu(app)?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon(app))
        // macOS renders a template image itself, inverting it for the light and
        // dark menu bar. Setting this on other platforms would strip the colour
        // from an icon that is supposed to have it.
        .icon_as_template(cfg!(target_os = "macos"))
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
            "maintenance" => crate::scheduler::run_now(app),
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
        // And the tile with it. What is left is the menu bar, which is the
        // whole point of a close that does not quit.
        set_dock_visible(app, false);
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

        let strings = crate::native_strings::current();
        let size = crate::native_strings::localized_size(bytes, &strings);
        let _ = handle
            .notification()
            .builder()
            .title("Uncached")
            .body(crate::native_strings::render(
                &strings.scan_finished,
                &strings.locale,
                targets,
                &size,
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
        data.get("totalBytesFound")?.as_u64()?,
    ))
}

#[cfg(test)]
mod tests {
    use super::parse_finished;

    /// Built by serializing the event the scan actually emits, never by hand.
    /// Hand-written, this fixture said `totalBytes` while the wire said
    /// `totalBytesFound`, so the parser returned `None` for every real scan and
    /// the notification never fired — with a green test over it the whole time.
    #[test]
    fn the_finished_event_yields_its_two_numbers() {
        let payload = serde_json::to_string(&crate::services::scan_service::scan_finished_event(
            "s", 12, 4096, 7, 0,
        ))
        .unwrap();

        assert_eq!(parse_finished(&payload), Some((12, 4096)));
    }

    #[test]
    fn an_unreadable_payload_costs_a_notification_and_nothing_else() {
        for payload in ["", "not json", "{}", r#"{"data":{"totalTargets":3}}"#] {
            assert_eq!(parse_finished(payload), None);
        }
    }
}
