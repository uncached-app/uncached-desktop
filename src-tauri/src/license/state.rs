use super::model::{License, LicenseInfo, LicenseState};
use super::verify::{authenticate, embedded_key};
use chrono::{DateTime, Utc};
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;
use tauri::AppHandle;
use tauri::Manager;

pub(super) const LICENSE_FILE: &str = "license.key";

/// The verified licence for this process, loaded once at startup.
///
/// A global rather than a parameter because `current_status()` is called from
/// places that have no `AppHandle` — the plan a category needs is asked for
/// deep inside a scan. Written only by activation and by startup.
pub(super) static ACTIVE: RwLock<Option<License>> = RwLock::new(None);

/// The authenticated licence, in date or not. `ACTIVE` drives entitlement;
/// this one drives what the user is told.
pub(super) static STORED: RwLock<Option<License>> = RwLock::new(None);

pub(crate) fn license_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(LICENSE_FILE))
        .map_err(|error| error.to_string())
}

/// Loads and verifies the stored licence. Called once, at startup.
///
/// A licence that no longer verifies — expired, or issued for a build whose key
/// changed — leaves the app on Free rather than failing to start. Losing Pro is
/// recoverable by the user; a window that will not open is not.
pub fn install(app: &AppHandle) {
    let Ok(path) = license_path(app) else { return };
    let Ok(stored) = fs::read_to_string(path) else {
        return;
    };
    let Ok(public_key) = embedded_key() else {
        return;
    };
    // Authenticated first, so an expired licence is remembered and explained
    // rather than discarded as though it had never been bought.
    match authenticate(&public_key, &stored) {
        Ok(license) => {
            let in_date = license.expires_at.is_none_or(|expiry| expiry > Utc::now());
            if let Ok(mut kept) = STORED.write() {
                *kept = Some(license.clone());
            }
            if in_date {
                if let Ok(mut active) = ACTIVE.write() {
                    *active = Some(license);
                }
            } else {
                crate::logging::info("license", "stored licence has expired");
            }
        }
        Err(error) => crate::logging::warn(
            "license",
            &format!("stored licence rejected reason=\"{}\"", error.message()),
        ),
    }
}

/// Builds what the settings screen shows from an authenticated licence.
pub fn state_of(license: &License, now: DateTime<Utc>) -> LicenseState {
    let expires_in_days = license.expires_at.map(|expiry| (expiry - now).num_days());
    LicenseState {
        license: LicenseInfo::from(license),
        expired: license.expires_at.is_some_and(|expiry| expiry <= now),
        expires_in_days,
    }
}

pub fn active_license() -> Option<License> {
    ACTIVE.read().ok().and_then(|active| active.clone())
}

/// Makes a freshly verified licence the one in force: remembered, so the settings
/// screen can explain it, and active, so it unlocks what it covers.
pub(crate) fn remember(license: License) {
    if let Ok(mut kept) = STORED.write() {
        *kept = Some(license.clone());
    }
    if let Ok(mut active) = ACTIVE.write() {
        *active = Some(license);
    }
}

/// Drops the licence from this process, in force and remembered alike.
pub(crate) fn forget() {
    if let Ok(mut active) = ACTIVE.write() {
        *active = None;
    }
    if let Ok(mut kept) = STORED.write() {
        *kept = None;
    }
}

/// The authenticated licence, in date or not, for telling the user about it.
pub(crate) fn stored_license() -> Option<License> {
    STORED.read().ok().and_then(|kept| kept.clone())
}
