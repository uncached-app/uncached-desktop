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

mod model;
mod state;
mod verify;

pub use model::{License, LicenseError, LicenseInfo, LicenseState};
pub use state::{active_license, install, state_of};
pub(crate) use state::{forget, license_path, remember, stored_license};
pub(crate) use verify::verify;
pub use verify::{authenticate, verify_with};

#[cfg(test)]
use verify::{public_key_from, PUBLIC_KEY};

#[cfg(test)]
mod tests;
