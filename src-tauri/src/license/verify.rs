use super::model::{License, LicenseError};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, VerifyingKey, SIGNATURE_LENGTH};

/// Set at build time. Absent in a build that was never given one.
pub(super) const PUBLIC_KEY: Option<&str> = option_env!("UNCACHED_LICENSE_PUBLIC_KEY");

pub(super) fn embedded_key() -> Result<VerifyingKey, LicenseError> {
    public_key_from(PUBLIC_KEY.ok_or(LicenseError::NoPublicKey)?)
}

/// Split out from the compile-time constant so the decoding can be tested. A
/// build whose key is a typo has to fail here, not at a user's first purchase.
pub(super) fn public_key_from(encoded: &str) -> Result<VerifyingKey, LicenseError> {
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

pub(crate) fn verify(key: &str) -> Result<License, LicenseError> {
    verify_with(&embedded_key()?, key, Utc::now())
}
