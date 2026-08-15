//! The menu bar, which is the same actions arriving by a different road.
//!
//! A desktop app without one is a web page in a window. macOS in particular
//! puts several things there the user will look for and find nothing: Quit,
//! Settings, Hide, and the window commands the system expects to own.
//!
//! Every item here carries an id the frontend already knows — the ones in
//! `src/actions.ts` — and clicking one emits `menu:action` with that id. So the
//! menu and the keyboard run the same code, and the accelerator printed beside
//! an item is the same string the keyboard handler was given. The alternative
//! is two lists that agree until one of them is edited.
//!
//! The accelerators come from the frontend rather than being written twice.
//! They can be overridden in `settings.json`, and a menu showing a key the app
//! no longer honours is worse than a menu showing none.

use tauri::menu::{AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// One item the frontend asked for: what it is called, what to emit, and the
/// key to print beside it.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuAction {
    pub id: String,
    pub label: String,
    /// Which submenu it belongs under.
    pub menu: String,
    /// In Tauri's spelling — `CmdOrCtrl+K`. Empty when it has no key.
    pub accelerator: String,
}

/// Builds the bar and hangs it on the app.
///
/// Rebuilt rather than patched when the bindings change: a menu is a tree of
/// native objects with no notion of "the accelerator for this id", and the
/// whole thing costs less than keeping a map of what was where.
pub fn install<R: Runtime>(app: &AppHandle<R>, actions: &[MenuAction]) -> tauri::Result<()> {
    // macOS keeps the menu bar at the top of the screen, where it exists
    // whatever the window looks like. Windows and Linux hang it off the window
    // frame, and this window has none — `decorations: false`, because the app
    // draws its own titlebar. A menu with nowhere to be drawn is worse than no
    // menu: every key it would have advertised still works, and the palette
    // reaches everything by name.
    if !cfg!(target_os = "macos") {
        return Ok(());
    }

    let mut file = SubmenuBuilder::new(app, "File");
    let mut view = SubmenuBuilder::new(app, "View");
    let mut workspace = SubmenuBuilder::new(app, "Workspace");

    for action in actions {
        let mut item = MenuItemBuilder::with_id(action.id.clone(), &action.label);
        if !action.accelerator.is_empty() {
            item = item.accelerator(&action.accelerator);
        }
        let item = item.build(app)?;
        match action.menu.as_str() {
            "File" => file = file.item(&item),
            "View" => view = view.item(&item),
            _ => workspace = workspace.item(&item),
        }
    }

    // The system's own, which macOS expects to own and users expect to find:
    // Quit, Hide, the window commands. Written by hand they are a worse copy of
    // something the platform already provides correctly.
    let application = SubmenuBuilder::new(app, "Uncached")
        .about(Some(AboutMetadata::default()))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    let menu: Menu<R> = MenuBuilder::new(app)
        .item(&application)
        .item(&file.build()?)
        .item(&view.build()?)
        .item(&workspace.build()?)
        .item(&window)
        .build()?;

    app.set_menu(menu)?;
    Ok(())
}

/// Sends a clicked item to the window as the action it is.
///
/// The frontend holds what every one of these means, and it has to: half of
/// them are a change of screen, and this side has no opinion about which screen
/// is showing.
pub fn on_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let _ = app.emit("menu:action", id);
    // A menu item can be chosen while the window is hidden in the tray, which
    // is a command sent to something nobody can see.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Builds the menu bar from what the frontend says the actions are.
///
/// Called on start and again whenever a binding changes, because an
/// accelerator printed beside an item has to be the one the app honours. The
/// labels and the keys live in `src/actions.ts` — one list, and this is the
/// road it takes to the native side rather than a second copy of it.
#[tauri::command]
pub fn install_menu(app: AppHandle, actions: Vec<MenuAction>) -> Result<(), String> {
    install(&app, &actions).map_err(|error| error.to_string())
}
