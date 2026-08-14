//! Issues the licence keys the app verifies.
//!
//! Run on the vendor's side, never shipped. Two commands:
//!
//! ```text
//! # once, to create the signing identity
//! openssl rand -hex 32                       # the seed. treat it as the crown jewels
//! cargo run --example license -- keygen <seed-hex>
//!
//! # per purchase
//! cargo run --example license -- issue <seed-hex> <id> <holder> [expires-at-rfc3339]
//! ```
//!
//! `keygen` prints the public key to compile into the app as
//! `UNCACHED_LICENSE_PUBLIC_KEY`. `issue` prints the key a buyer pastes.
//!
//! ```text
//! # support: does this customer's key actually verify?
//! cargo run --example license -- verify <public-key> <licence-key>
//! ```
//!
//! `verify` reads the same code path the app does, so it also proves that a key
//! minted anywhere else — the Lemon Squeezy webhook signs with WebCrypto, not
//! with this file — is one the app will accept.
//!
//! The seed is the whole security model. Anyone holding it can mint licences;
//! nobody without it can. It belongs in a password manager or the merchant's
//! secret store, never in this repository and never in a build.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signer, SigningKey};

fn seed_from_hex(hex: &str) -> Result<[u8; 32], String> {
    let hex = hex.trim();
    if hex.len() != 64 {
        return Err("the seed must be 64 hex characters (32 bytes)".into());
    }
    let mut seed = [0u8; 32];
    for (index, byte) in seed.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16)
            .map_err(|_| "the seed must be hexadecimal".to_string())?;
    }
    Ok(seed)
}

fn main() {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let result = match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["keygen", seed] => keygen(seed),
        ["issue", seed, id, holder] => issue(seed, id, holder, None),
        ["issue", seed, id, holder, expires] => issue(seed, id, holder, Some(expires)),
        ["verify", public_key, license] => verify(public_key, license),
        _ => Err(concat!(
            "usage:\n",
            "  license keygen <seed-hex>\n",
            "  license issue <seed-hex> <id> <holder> [expires-at-rfc3339]\n",
            "  license verify <public-key> <licence-key>"
        )
        .to_string()),
    };

    match result {
        Ok(output) => println!("{output}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}

fn keygen(seed: &str) -> Result<String, String> {
    let signing = SigningKey::from_bytes(&seed_from_hex(seed)?);
    let public = URL_SAFE_NO_PAD.encode(signing.verifying_key().to_bytes());
    Ok(format!(
        "public key (compile into the app):\n\n  UNCACHED_LICENSE_PUBLIC_KEY={public}\n\n\
         Keep the seed secret. It is the only thing that can mint a licence,\n\
         and rotating it invalidates every key already sold."
    ))
}

fn issue(seed: &str, id: &str, holder: &str, expires: Option<&str>) -> Result<String, String> {
    let signing = SigningKey::from_bytes(&seed_from_hex(seed)?);
    let expires_at = match expires {
        Some(value) => Some(
            value
                .parse::<DateTime<Utc>>()
                .map_err(|_| "expiry must be RFC 3339, e.g. 2027-01-31T00:00:00Z".to_string())?,
        ),
        None => None,
    };

    // Field order is the serialized order, and the signature covers the bytes
    // as written. The app re-reads them the same way, so this must stay in step
    // with `License` in `commands/license.rs`.
    let payload = serde_json::json!({
        "v": 1,
        "id": id,
        "holder": holder,
        "plan": "pro",
        "issuedAt": Utc::now(),
        "expiresAt": expires_at,
        "seats": 1,
    });
    let bytes = serde_json::to_vec(&payload).map_err(|error| error.to_string())?;
    let signature = signing.sign(&bytes);

    Ok(format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(&bytes),
        URL_SAFE_NO_PAD.encode(signature.to_bytes())
    ))
}

fn verify(public_key: &str, license: &str) -> Result<String, String> {
    use ed25519_dalek::VerifyingKey;

    let b64 = URL_SAFE_NO_PAD;

    let bytes = b64
        .decode(public_key.trim())
        .map_err(|_| "the public key is not base64url".to_string())?;
    let bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "the public key must be 32 bytes".to_string())?;
    let key = VerifyingKey::from_bytes(&bytes).map_err(|error| error.to_string())?;

    match uncached_lib::commands::license::verify_with(&key, license, Utc::now()) {
        Ok(parsed) => Ok(format!(
            "valid\n  id      {}\n  holder  {}\n  plan    {}\n  seats   {}\n  expires {}",
            parsed.id,
            parsed.holder,
            parsed.plan,
            parsed.seats.unwrap_or(1),
            parsed
                .expires_at
                .map(|at| at.to_rfc3339())
                .unwrap_or_else(|| "never".into()),
        )),
        Err(error) => Err(format!("rejected: {}", error.message())),
    }
}
