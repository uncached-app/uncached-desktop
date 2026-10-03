//! The licence commands the window calls. What a licence is, how it is verified and
//! what the process holds lives in `crate::license`.

use crate::license::{
    forget, license_path, remember, state_of, stored_license, verify, LicenseError, LicenseInfo,
    LicenseState,
};
use chrono::Utc;
use std::fs;
use tauri::AppHandle;

impl From<LicenseError> for crate::errors::CommandError {
    fn from(error: LicenseError) -> Self {
        let base = crate::errors::CommandError::new(error.code(), error.message());
        match &error {
            LicenseError::UnsupportedVersion(version) => base.with("version", version.to_string()),
            LicenseError::Expired(at) => base.with("date", at.format("%Y-%m-%d").to_string()),
            LicenseError::NotPro(plan) => base.with("plan", plan.clone()),
            _ => base,
        }
    }
}

#[tauri::command]
pub async fn activate_license(
    app: AppHandle,
    key: String,
) -> Result<LicenseInfo, crate::errors::CommandError> {
    let license = verify(&key)?;
    let path = license_path(&app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid licence path".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    // Stored as pasted. Re-verified on every launch, so the file is a copy of
    // the receipt rather than a claim the app has to take on faith.
    fs::write(&path, key.trim()).map_err(|error| error.to_string())?;

    let info = LicenseInfo::from(&license);
    remember(license);
    Ok(info)
}

/// The key as it was pasted, for moving this licence to another machine.
///
/// The settings screen offers removal, and removal is the step that locks
/// somebody out: the key lives in an email they may no longer be able to find,
/// and the app was the last place holding a copy. Handing it back before the
/// destructive button is what makes that button safe to press.
///
/// Not a secret this hides from its owner — it is their receipt, on their
/// machine, readable with a text editor either way.
#[tauri::command]
pub async fn stored_license_key(app: AppHandle) -> Option<String> {
    let key = fs::read_to_string(license_path(&app).ok()?).ok()?;
    let key = key.trim();
    (!key.is_empty()).then(|| key.to_owned())
}

#[tauri::command]
pub async fn deactivate_license(app: AppHandle) -> Result<(), String> {
    let path = license_path(&app)?;
    match fs::remove_file(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    forget();
    Ok(())
}

#[tauri::command]
pub async fn get_license() -> Option<LicenseState> {
    if let Some(stored) = stored_license() {
        return Some(state_of(&stored, Utc::now()));
    }
    if cfg!(debug_assertions) && std::env::var_os("UNCACHED_DEV_PRO").is_some() {
        return Some(LicenseState {
            license: LicenseInfo {
                id: "DEV-PRO-LOCAL-BUILD".to_string(),
                holder: "Developer (Debug Mode)".to_string(),
                plan: "Pro".to_string(),
                expires_at: None,
                seats: 1,
            },
            expired: false,
            expires_in_days: None,
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::LicenseError;
    use chrono::Utc;

    /// The interface picks the sentence by code and fills it from the params,
    /// so every refusal has to arrive as data it can translate.
    #[test]
    fn a_refused_key_reaches_the_interface_as_a_code_with_its_details() {
        use crate::errors::CommandError;

        let expired = CommandError::from(LicenseError::Expired(
            chrono::DateTime::parse_from_rfc3339("2026-09-01T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        ));
        assert_eq!(expired.code, "licence_expired");
        assert_eq!(
            expired.params.get("date").map(String::as_str),
            Some("2026-09-01")
        );

        let plan = CommandError::from(LicenseError::NotPro("team".into()));
        assert_eq!(plan.code, "licence_not_pro");
        assert_eq!(plan.params.get("plan").map(String::as_str), Some("team"));

        let malformed = CommandError::from(LicenseError::Malformed);
        assert_eq!(malformed.code, "licence_malformed");
        assert!(malformed.params.is_empty());
        assert_eq!(malformed.message, LicenseError::Malformed.message());
    }
}
