//! Turning a purchase into an unlocked app.
//!
//! The design constraint comes from `docs/IDEAS_MONETIZATION_ROADMAP.md`: a
//! licence verified in the Rust layer, tolerant of being offline, with Pro
//! blocked natively and no invasive hardware fingerprint. Everything here
//! follows from those four.
//!
//! A licence is a signed statement, not a secret to compare against. The
//! merchant signs `{holder, plan, dates}` with a private key that never leaves
//! their side; the app carries only the public half and checks the signature.
//! That is what makes offline work: verification is arithmetic on bytes already
//! in hand, so a plane, a firewall or a dead vendor server cannot lock a paying
//! user out of what they bought.
//!
//! It is deliberately not anti-piracy. A determined user can patch the binary,
//! and the roadmap is explicit that anti-crack work comes after proving people
//! pay — not before. What this does prevent is the thing that would make the
//! paywall decorative: minting a valid licence without the private key.
//!
//! The public key is compiled in from `UNCACHED_LICENSE_PUBLIC_KEY`. A build
//! without it can verify nothing and every activation fails, which is the right
//! default for a key that must not be invented by this file.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, VerifyingKey, SIGNATURE_LENGTH};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;
use tauri::{AppHandle, Manager};

const LICENSE_FILE: &str = "license.key";

/// Set at build time. Absent in a build that was never given one.
const PUBLIC_KEY: Option<&str> = option_env!("UNCACHED_LICENSE_PUBLIC_KEY");

/// What the merchant signed.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct License {
    /// Payload version. An unknown one is refused rather than guessed at.
    pub v: u32,
    /// Opaque licence id, for the user to quote in a support request.
    pub id: String,
    /// Who bought it. Shown back to them so an activation is verifiable by eye.
    pub holder: String,
    pub plan: String,
    pub issued_at: DateTime<Utc>,
    /// Absent for a perpetual licence, which is what an early-access purchase
    /// is. A subscription carries a date and stops unlocking after it.
    #[serde(default)]
    pub expires_at: Option<DateTime<Utc>>,
    /// Machines this licence covers. Absent means one.
    ///
    /// Stated, not counted. Nothing offline can enforce a seat limit: each
    /// machine can prove the key is genuine and none of them can know the
    /// others exist. Carrying the number in the signed payload is what keeps
    /// the claim honest — it travels with the purchase instead of living on a
    /// web page, and a team licence later is a different number rather than a
    /// different format.
    #[serde(default)]
    pub seats: Option<u32>,
}

/// What the settings screen needs to say, including the unhappy case.
///
/// Renewal is delivered by email, which means a paying user can arrive at an
/// expired licence through no fault of their own — an email in spam, a card
/// that failed. Reporting that as "no licence" would be both wrong and the
/// worst moment this product has. It reports it as expired, with the date.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LicenseState {
    pub license: LicenseInfo,
    pub expired: bool,
    /// Days until expiry, negative once past. Absent for a perpetual licence.
    pub expires_in_days: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LicenseInfo {
    pub id: String,
    pub holder: String,
    pub plan: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub seats: u32,
}

impl From<&License> for LicenseInfo {
    fn from(license: &License) -> Self {
        Self {
            id: license.id.clone(),
            holder: license.holder.clone(),
            plan: license.plan.clone(),
            expires_at: license.expires_at,
            seats: license.seats.unwrap_or(1),
        }
    }
}

/// Every way a key can fail to unlock the app.
///
/// Each one names what the user can do about it, because a licence that will
/// not activate is the single worst moment a paid product has.
#[derive(Debug, PartialEq, Eq)]
pub enum LicenseError {
    Malformed,
    BadSignature,
    UnsupportedVersion(u32),
    Expired(DateTime<Utc>),
    NotPro(String),
    NoPublicKey,
}

impl LicenseError {
    pub fn message(&self) -> String {
        match self {
            Self::Malformed => "That is not a licence key. Paste the whole line from your receipt.".into(),
            Self::BadSignature => {
                "This key was not issued by Uncached, or it was altered in transit.".into()
            }
            Self::UnsupportedVersion(version) => format!(
                "This key needs a newer version of Uncached to read (format {version})."
            ),
            Self::Expired(at) => format!("This licence expired on {}.", at.format("%Y-%m-%d")),
            Self::NotPro(plan) => format!("This key unlocks \"{plan}\", which this build has nothing to unlock."),
            Self::NoPublicKey => {
                "This build cannot verify licences. It was compiled without a signing key.".into()
            }
        }
    }
}

/// The verified licence for this process, loaded once at startup.
///
/// A global rather than a parameter because `current_status()` is called from
/// places that have no `AppHandle` — the plan a category needs is asked for
/// deep inside a scan. Written only by activation and by startup.
static ACTIVE: RwLock<Option<License>> = RwLock::new(None);

/// The authenticated licence, in date or not. `ACTIVE` drives entitlement;
/// this one drives what the user is told.
static STORED: RwLock<Option<License>> = RwLock::new(None);

fn license_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(LICENSE_FILE))
        .map_err(|error| error.to_string())
}

fn embedded_key() -> Result<VerifyingKey, LicenseError> {
    public_key_from(PUBLIC_KEY.ok_or(LicenseError::NoPublicKey)?)
}

/// Split out from the compile-time constant so the decoding can be tested. A
/// build whose key is a typo has to fail here, not at a user's first purchase.
fn public_key_from(encoded: &str) -> Result<VerifyingKey, LicenseError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded.trim())
        .map_err(|_| LicenseError::NoPublicKey)?;
    let bytes: [u8; 32] = bytes.try_into().map_err(|_| LicenseError::NoPublicKey)?;
    VerifyingKey::from_bytes(&bytes).map_err(|_| LicenseError::NoPublicKey)
}

/// Proves the key was issued by us, and says nothing about whether it is still
/// in date.
///
/// Split from expiry on purpose. A lapsed licence is still a real purchase by a
/// real person, and the interface has to be able to say "this expired on the
/// 3rd" instead of behaving as though the key were forged. Entitlement reads
/// [`verify_with`]; the settings screen reads this.
pub fn authenticate(public_key: &VerifyingKey, key: &str) -> Result<License, LicenseError> {
    let (payload, signature) = key.trim().split_once('.').ok_or(LicenseError::Malformed)?;
    let payload_bytes = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| LicenseError::Malformed)?;
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(signature)
        .map_err(|_| LicenseError::Malformed)?;
    let signature_bytes: [u8; SIGNATURE_LENGTH] = signature_bytes
        .try_into()
        .map_err(|_| LicenseError::Malformed)?;

    // Signature first, always. Nothing inside the payload is trusted enough to
    // be read — not the version, not the dates — until the bytes are proven to
    // be the ones that were signed.
    public_key
        .verify_strict(&payload_bytes, &Signature::from_bytes(&signature_bytes))
        .map_err(|_| LicenseError::BadSignature)?;

    let license: License =
        serde_json::from_slice(&payload_bytes).map_err(|_| LicenseError::Malformed)?;
    if license.v != 1 {
        return Err(LicenseError::UnsupportedVersion(license.v));
    }
    if license.plan != "pro" {
        return Err(LicenseError::NotPro(license.plan));
    }
    Ok(license)
}

/// Authenticates the key and requires it to be in date. This is what decides
/// whether the process runs as Pro.
pub fn verify_with(
    public_key: &VerifyingKey,
    key: &str,
    now: DateTime<Utc>,
) -> Result<License, LicenseError> {
    let license = authenticate(public_key, key)?;
    if let Some(expiry) = license.expires_at {
        if expiry <= now {
            return Err(LicenseError::Expired(expiry));
        }
    }
    Ok(license)
}

fn verify(key: &str) -> Result<License, LicenseError> {
    verify_with(&embedded_key()?, key, Utc::now())
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
            let in_date = license
                .expires_at
                .is_none_or(|expiry| expiry > Utc::now());
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
    let expires_in_days = license
        .expires_at
        .map(|expiry| (expiry - now).num_days());
    LicenseState {
        license: LicenseInfo::from(license),
        expired: license.expires_at.is_some_and(|expiry| expiry <= now),
        expires_in_days,
    }
}

pub fn active_license() -> Option<License> {
    ACTIVE.read().ok().and_then(|active| active.clone())
}

#[tauri::command]
pub async fn activate_license(app: AppHandle, key: String) -> Result<LicenseInfo, String> {
    let license = verify(&key).map_err(|error| error.message())?;
    let path = license_path(&app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid licence path".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    // Stored as pasted. Re-verified on every launch, so the file is a copy of
    // the receipt rather than a claim the app has to take on faith.
    fs::write(&path, key.trim()).map_err(|error| error.to_string())?;

    let info = LicenseInfo::from(&license);
    if let Ok(mut kept) = STORED.write() {
        *kept = Some(license.clone());
    }
    if let Ok(mut active) = ACTIVE.write() {
        *active = Some(license);
    }
    Ok(info)
}

#[tauri::command]
pub async fn deactivate_license(app: AppHandle) -> Result<(), String> {
    let path = license_path(&app)?;
    match fs::remove_file(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    if let Ok(mut active) = ACTIVE.write() {
        *active = None;
    }
    if let Ok(mut kept) = STORED.write() {
        *kept = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_license() -> Option<LicenseState> {
    let stored = STORED.read().ok().and_then(|kept| kept.clone())?;
    Some(state_of(&stored, Utc::now()))
}

#[cfg(test)]
mod tests {
    use super::{verify_with, LicenseError};
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    use chrono::{Duration, Utc};
    use ed25519_dalek::{Signer, SigningKey};

    /// A fixed key, so the tests need no randomness and no build-time secret.
    fn keypair() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    fn sign(signer: &SigningKey, payload: serde_json::Value) -> String {
        let bytes = serde_json::to_vec(&payload).unwrap();
        let signature = signer.sign(&bytes);
        format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(&bytes),
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        )
    }

    fn payload() -> serde_json::Value {
        serde_json::json!({
            "v": 1,
            "id": "lic_0001",
            "holder": "buyer@example.com",
            "plan": "pro",
            "issuedAt": Utc::now() - Duration::days(1),
            "expiresAt": serde_json::Value::Null,
        })
    }

    #[test]
    fn a_signed_perpetual_licence_unlocks_pro() {
        let signer = keypair();
        let key = sign(&signer, payload());
        let license = verify_with(&signer.verifying_key(), &key, Utc::now()).unwrap();

        assert_eq!(license.holder, "buyer@example.com");
        assert_eq!(license.plan, "pro");
        assert!(license.expires_at.is_none());
    }

    /// The property the whole scheme exists for: without the private key, a
    /// licence cannot be minted. Anything less and the paywall is decoration.
    #[test]
    fn a_licence_signed_by_anyone_else_is_refused() {
        let attacker = SigningKey::from_bytes(&[9u8; 32]);
        let key = sign(&attacker, payload());

        assert_eq!(
            verify_with(&keypair().verifying_key(), &key, Utc::now()),
            Err(LicenseError::BadSignature)
        );
    }

    /// Editing the payload after signing has to fail even though every field is
    /// still well-formed — this is the upgrade-yourself-to-pro path.
    #[test]
    fn a_payload_edited_after_signing_is_refused() {
        let signer = keypair();
        let key = sign(&signer, payload());
        let (_, signature) = key.split_once('.').unwrap();
        let forged = serde_json::json!({
            "v": 1,
            "id": "lic_0001",
            "holder": "someone@else",
            "plan": "pro",
            "issuedAt": Utc::now(),
            "expiresAt": serde_json::Value::Null,
        });
        let tampered = format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&forged).unwrap()),
            signature
        );

        assert_eq!(
            verify_with(&signer.verifying_key(), &tampered, Utc::now()),
            Err(LicenseError::BadSignature)
        );
    }

    #[test]
    fn an_expired_subscription_stops_unlocking() {
        let signer = keypair();
        let expiry = Utc::now() - Duration::days(2);
        let mut claims = payload();
        claims["expiresAt"] = serde_json::to_value(expiry).unwrap();
        let key = sign(&signer, claims);

        assert_eq!(
            verify_with(&signer.verifying_key(), &key, Utc::now()),
            Err(LicenseError::Expired(expiry))
        );
    }

    /// Expiry is read against a clock the caller passes in, so the same licence
    /// verifies before its date and stops after it.
    #[test]
    fn a_subscription_verifies_until_its_date() {
        let signer = keypair();
        let expiry = Utc::now() + Duration::days(30);
        let mut claims = payload();
        claims["expiresAt"] = serde_json::to_value(expiry).unwrap();
        let key = sign(&signer, claims);

        assert!(verify_with(&signer.verifying_key(), &key, Utc::now()).is_ok());
        assert!(verify_with(&signer.verifying_key(), &key, expiry + Duration::seconds(1)).is_err());
    }

    #[test]
    fn a_future_payload_format_is_refused_rather_than_guessed_at() {
        let signer = keypair();
        let mut claims = payload();
        claims["v"] = serde_json::json!(2);
        let key = sign(&signer, claims);

        assert_eq!(
            verify_with(&signer.verifying_key(), &key, Utc::now()),
            Err(LicenseError::UnsupportedVersion(2))
        );
    }

    #[test]
    fn anything_that_is_not_a_key_is_malformed_not_a_crash() {
        let public = keypair().verifying_key();
        for input in ["", "not-a-key", "onlyonepart", "a.b", "....."] {
            assert!(matches!(
                verify_with(&public, input, Utc::now()),
                Err(LicenseError::Malformed | LicenseError::BadSignature)
            ));
        }
    }

    /// Closes the seam between the issuing tool and the app: a key printed by
    /// `examples/license.rs` has to decode into the verifier that reads it.
    #[test]
    fn the_public_key_format_the_issuer_prints_is_the_one_the_app_reads() {
        let signer = keypair();
        let printed = URL_SAFE_NO_PAD.encode(signer.verifying_key().to_bytes());
        let parsed = super::public_key_from(&printed).unwrap();

        assert_eq!(parsed, signer.verifying_key());
        assert!(verify_with(&parsed, &sign(&signer, payload()), Utc::now()).is_ok());
        assert!(matches!(
            super::public_key_from("not base64!"),
            Err(LicenseError::NoPublicKey)
        ));
        assert!(matches!(
            super::public_key_from(&URL_SAFE_NO_PAD.encode([1u8; 16])),
            Err(LicenseError::NoPublicKey)
        ));
    }

    /// The case email-delivered renewal makes real: a licence that lapsed is
    /// still a purchase, and has to be reported as expired rather than absent.
    #[test]
    fn an_expired_licence_is_remembered_with_its_date() {
        let signer = keypair();
        let expiry = Utc::now() - Duration::days(3);
        let mut claims = payload();
        claims["expiresAt"] = serde_json::to_value(expiry).unwrap();
        let key = sign(&signer, claims);

        // Entitlement refuses it...
        assert!(verify_with(&signer.verifying_key(), &key, Utc::now()).is_err());
        // ...but it still authenticates, which is what lets the screen explain.
        let license = super::authenticate(&signer.verifying_key(), &key).unwrap();
        let state = super::state_of(&license, Utc::now());

        assert!(state.expired);
        assert_eq!(state.expires_in_days, Some(-3));
        assert_eq!(state.license.holder, "buyer@example.com");
    }

    #[test]
    fn a_licence_close_to_expiry_reports_the_days_left() {
        let signer = keypair();
        let mut claims = payload();
        claims["expiresAt"] = serde_json::to_value(Utc::now() + Duration::days(9)).unwrap();
        let license = super::authenticate(&signer.verifying_key(), &sign(&signer, claims)).unwrap();
        let state = super::state_of(&license, Utc::now());

        assert!(!state.expired);
        assert_eq!(state.expires_in_days, Some(8));
    }

    /// A licence issued before seats existed is a one-machine licence, not a
    /// zero-machine one. The field is optional so old keys keep working.
    #[test]
    fn a_licence_without_a_seat_count_covers_one_machine() {
        let signer = keypair();
        let license = super::authenticate(&signer.verifying_key(), &sign(&signer, payload())).unwrap();
        assert_eq!(license.seats, None);
        assert_eq!(super::LicenseInfo::from(&license).seats, 1);

        let mut claims = payload();
        claims["seats"] = serde_json::json!(5);
        let team = super::authenticate(&signer.verifying_key(), &sign(&signer, claims)).unwrap();
        assert_eq!(super::LicenseInfo::from(&team).seats, 5);
    }

    #[test]
    fn a_perpetual_licence_never_counts_down() {
        let signer = keypair();
        let license = super::authenticate(&signer.verifying_key(), &sign(&signer, payload())).unwrap();
        let state = super::state_of(&license, Utc::now());

        assert!(!state.expired);
        assert_eq!(state.expires_in_days, None);
    }

    /// Guards the build itself. The key is compiled in from an environment
    /// variable, so a typo in `.cargo/config.toml` — a missing quote, a
    /// truncated paste — would produce a binary that refuses every licence and
    /// says nothing about why until a paying customer reports it.
    ///
    /// Skipped rather than failed when no key is configured: a contributor
    /// building from a clone has nothing to verify, and that is not an error.
    #[test]
    fn a_configured_public_key_is_readable() {
        let Some(configured) = super::PUBLIC_KEY else {
            return;
        };
        assert!(
            super::public_key_from(configured).is_ok(),
            "UNCACHED_LICENSE_PUBLIC_KEY is set but not a valid key: {configured:?}"
        );
    }

    #[test]
    fn every_failure_says_what_to_do_about_it() {
        for error in [
            LicenseError::Malformed,
            LicenseError::BadSignature,
            LicenseError::UnsupportedVersion(2),
            LicenseError::Expired(Utc::now()),
            LicenseError::NotPro("team".into()),
            LicenseError::NoPublicKey,
        ] {
            assert!(!error.message().is_empty());
        }
    }
}
