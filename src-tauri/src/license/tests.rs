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
