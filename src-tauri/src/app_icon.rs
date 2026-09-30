//! The icon the running app shows in the Dock (macOS) or on its window
//! (Linux). The bundle's own icon, which Finder, Launchpad and the desktop menu
//! read, is never touched: rewriting it would break the code signature.

use crate::errors::command::CommandError;
use tauri::AppHandle;

/// Id and 512px PNG of every variant `scripts/icons.py --variants` renders.
/// Ids are persisted in settings.
pub const VARIANTS: &[(&str, &[u8])] = &[
    ("night", include_bytes!("../icons/variants/night.png")),
    ("hazard", include_bytes!("../icons/variants/hazard.png")),
    ("sunset", include_bytes!("../icons/variants/sunset.png")),
    ("olive", include_bytes!("../icons/variants/olive.png")),
    ("ultraviolet", include_bytes!("../icons/variants/ultraviolet.png")),
    ("evergreen", include_bytes!("../icons/variants/evergreen.png")),
];

/// The variant the bundle ships as its icon.
pub const DEFAULT: &str = "night";

fn bytes_of(variant: &str) -> Option<&'static [u8]> {
    VARIANTS
        .iter()
        .find(|(id, _)| *id == variant)
        .map(|(_, bytes)| *bytes)
}

/// Shows `variant`, or the bundle icon for `None` or the default.
pub fn apply(app: &AppHandle, variant: Option<&str>) -> Result<(), CommandError> {
    let bytes = match variant.filter(|id| *id != DEFAULT) {
        None => None,
        Some(id) => Some(bytes_of(id).ok_or_else(|| {
            CommandError::new("unknown_icon", format!("No icon named {id}")).with("icon", id)
        })?),
    };
    show(app, bytes)
}

#[cfg(target_os = "macos")]
fn show(app: &AppHandle, bytes: Option<&'static [u8]>) -> Result<(), CommandError> {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApp, NSImage};
    use objc2_foundation::NSData;

    app.run_on_main_thread(move || {
        let Some(marker) = MainThreadMarker::new() else {
            return;
        };
        let image = bytes.and_then(|bytes| {
            let data = NSData::with_bytes(bytes);
            NSImage::initWithData(NSImage::alloc(), &data)
        });
        // SAFETY: called on the main thread; `None` restores the bundle icon.
        unsafe { NSApp(marker).setApplicationIconImage(image.as_deref()) };
    })
    .map_err(|error| CommandError::from(error.to_string()))
}

#[cfg(not(target_os = "macos"))]
fn show(app: &AppHandle, bytes: Option<&'static [u8]>) -> Result<(), CommandError> {
    use tauri::Manager;
    let bytes = bytes.or_else(|| bytes_of(DEFAULT)).unwrap_or_default();
    let image = tauri::image::Image::from_bytes(bytes)
        .map_err(|error| CommandError::from(error.to_string()))?;
    for window in app.webview_windows().values() {
        window
            .set_icon(image.clone())
            .map_err(|error| CommandError::from(error.to_string()))?;
    }
    Ok(())
}

/// Chooses the icon and remembers it. Anything but the default is Pro.
#[tauri::command]
pub async fn set_app_icon(app: AppHandle, variant: Option<String>) -> Result<(), CommandError> {
    let chosen = variant.filter(|id| id != DEFAULT);
    if chosen.is_some() && !crate::commands::entitlements::current_status().pro_enabled {
        return Err(CommandError::new("requires_pro_icon", "Changing the app icon requires Uncached Pro"));
    }
    apply(&app, chosen.as_deref())?;
    let mut settings = crate::commands::settings::load_settings(&app)?;
    settings.app_icon = chosen;
    crate::commands::settings::persist_settings(&app, &settings)?;
    Ok(())
}

/// Reapplies the saved icon at launch, since the Dock forgets it on quit.
pub fn restore(app: &AppHandle) {
    if !crate::commands::entitlements::current_status().pro_enabled {
        return;
    }
    let Ok(settings) = crate::commands::settings::load_settings(app) else {
        return;
    };
    if let Err(error) = apply(app, settings.app_icon.as_deref()) {
        crate::logging::warn("icon", &format!("restore failed error=\"{}\"", error.message));
    }
}

#[cfg(test)]
mod tests {
    use super::{bytes_of, DEFAULT, VARIANTS};

    #[test]
    fn every_variant_is_a_png_and_the_default_is_one_of_them() {
        for (id, bytes) in VARIANTS {
            assert!(bytes.starts_with(b"\x89PNG"), "{id} is not a PNG");
        }
        assert!(bytes_of(DEFAULT).is_some());
        assert!(bytes_of("chartreuse").is_none());
    }
}
