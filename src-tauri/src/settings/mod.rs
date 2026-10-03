//! The user's settings: their shape, where they are kept, and the login item that
//! follows them. The commands that expose them to the window are in
//! `commands::settings`; everything else in the app that needs a setting reads it
//! from here, so no part of the app depends on the command layer to know one.

mod autostart;
mod model;
mod store;

pub use autostart::apply_autostart;
pub use model::{AppSettings, Appearance, Language, LastCleanup};
pub(crate) use store::{keep_backend_stamps, persist_settings};
pub use store::{load_settings, record_cleanup, record_maintenance_run, record_weekly_digest};
