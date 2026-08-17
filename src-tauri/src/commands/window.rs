//! Moving the window's edges from the frontend.
//!
//! Tauri offers `start_resize_dragging`, which hands the drag to the window
//! manager and is the right thing everywhere it exists. On macOS it does not:
//! `tao`'s implementation returns `NotSupported`, so the call is a no-op and the
//! only resize border is the system's own — which, on an undecorated window
//! inset by a shadow gutter, sits in transparent space outside everything the
//! user can see. The app looked like it could not be resized from its edges.
//!
//! So the drag is run by the caller and lands here as a frame. One command
//! rather than a `set_size` and a `set_position` from JavaScript: dragging the
//! left edge changes both, and two round trips means the window is briefly a
//! rectangle nobody asked for — visible as a shudder along the opposite edge.

use tauri::{PhysicalPosition, PhysicalSize};

/// Places the window's outer rectangle, in physical pixels.
///
/// Size before position: the window manager clamps the size to the configured
/// minimum, and the caller has already clamped the position to match. Applying
/// the position first would move a window that then refuses to shrink, walking
/// it across the screen for as long as the pointer kept pushing.
#[tauri::command]
pub async fn set_window_frame(
    window: tauri::Window,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    window
        .set_size(PhysicalSize::new(width.max(1), height.max(1)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}
