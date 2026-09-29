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

/// Every title in the bar that is not an action, in the interface language.
///
/// Required rather than defaulted: the platform's own defaults are English
/// whatever the system language is, so a missing title would be a menu in two
/// languages at once.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuLabels {
    pub file: String,
    pub edit: String,
    pub view: String,
    pub workspace: String,
    pub window: String,
    pub about: String,
    pub services: String,
    pub hide: String,
    pub hide_others: String,
    pub show_all: String,
    pub quit: String,
    pub undo: String,
    pub redo: String,
    pub cut: String,
    pub copy: String,
    pub paste: String,
    pub select_all: String,
    pub minimize: String,
    pub zoom: String,
    pub close_window: String,
}

/// Builds the bar and hangs it on the app.
///
/// Rebuilt rather than patched when the bindings change: a menu is a tree of
/// native objects with no notion of "the accelerator for this id", and the
/// whole thing costs less than keeping a map of what was where.
pub fn install<R: Runtime>(
    app: &AppHandle<R>,
    actions: &[MenuAction],
    labels: &MenuLabels,
) -> tauri::Result<()> {
    // macOS keeps the menu bar at the top of the screen, where it exists
    // whatever the window looks like. Windows and Linux hang it off the window
    // frame, and this window has none — `decorations: false`, because the app
    // draws its own titlebar. A menu with nowhere to be drawn is worse than no
    // menu: every key it would have advertised still works, and the palette
    // reaches everything by name.
    if !cfg!(target_os = "macos") {
        return Ok(());
    }

    let mut file = SubmenuBuilder::new(app, &labels.file);
    let mut view = SubmenuBuilder::new(app, &labels.view);
    let mut workspace = SubmenuBuilder::new(app, &labels.workspace);

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
        .about_with_text(&labels.about, Some(AboutMetadata::default()))
        .separator()
        .services_with_text(&labels.services)
        .separator()
        .hide_with_text(&labels.hide)
        .hide_others_with_text(&labels.hide_others)
        .show_all_with_text(&labels.show_all)
        .separator()
        .quit_with_text(&labels.quit)
        .build()?;

    // Not decoration, and not "the menus a Mac app is supposed to have".
    //
    // On macOS ⌘V is delivered by the menu bar, not by the web view: the key
    // goes up the responder chain looking for a menu item that claims it, and
    // finds nothing when there is no Edit menu. So an app without one has text
    // fields that cannot be pasted into — which is every field in this app, and
    // the licence key is the one that matters, because a 263-character signed
    // token is not something anybody is going to type.
    //
    // The items are the system's own, so they act on whatever holds focus and
    // grey themselves out when nothing does.
    let edit = SubmenuBuilder::new(app, &labels.edit)
        .undo_with_text(&labels.undo)
        .redo_with_text(&labels.redo)
        .separator()
        .cut_with_text(&labels.cut)
        .copy_with_text(&labels.copy)
        .paste_with_text(&labels.paste)
        .select_all_with_text(&labels.select_all)
        .build()?;

    let window = SubmenuBuilder::new(app, &labels.window)
        .minimize_with_text(&labels.minimize)
        .maximize_with_text(&labels.zoom)
        .separator()
        .close_window_with_text(&labels.close_window)
        .build()?;

    let menu: Menu<R> = MenuBuilder::new(app)
        .item(&application)
        .item(&file.build()?)
        .item(&edit)
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
pub fn install_menu(
    app: AppHandle,
    actions: Vec<MenuAction>,
    labels: MenuLabels,
) -> Result<(), String> {
    install(&app, &actions, &labels).map_err(|error| error.to_string())
}
