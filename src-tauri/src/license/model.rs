use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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
    /// Stable name the interface translates by.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Malformed => "licence_malformed",
            Self::BadSignature => "licence_bad_signature",
            Self::UnsupportedVersion(_) => "licence_unsupported_version",
            Self::Expired(_) => "licence_expired",
            Self::NotPro(_) => "licence_not_pro",
            Self::NoPublicKey => "licence_no_public_key",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::Malformed => {
                "That is not a licence key. Paste the whole line from your receipt.".into()
            }
            Self::BadSignature => {
                "This key was not issued by Uncached, or it was altered in transit.".into()
            }
            Self::UnsupportedVersion(version) => {
                format!("This key needs a newer version of Uncached to read (format {version}).")
            }
            Self::Expired(at) => format!("This licence expired on {}.", at.format("%Y-%m-%d")),
            Self::NotPro(plan) => {
                format!("This key unlocks \"{plan}\", which this build has nothing to unlock.")
            }
            Self::NoPublicKey => {
                "This build cannot verify licences. It was compiled without a signing key.".into()
            }
        }
    }
}
