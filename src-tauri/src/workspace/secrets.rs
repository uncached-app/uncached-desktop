//! Files in a repository that hold credentials, and whether Git would publish
//! them: committed, or untracked and not ignored.

use serde::Serialize;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SecretKind {
    Env,
    PrivateKey,
    Credentials,
    /// A package registry or machine login token.
    Token,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExposedSecret {
    /// Relative to the repository root, `/`-separated as Git prints it.
    pub path: String,
    /// In the index, so already in the history of every clone.
    pub committed: bool,
    pub kind: SecretKind,
}

pub const MAX_EXPOSED: usize = 50;

/// How much of a file is read to confirm a name shared with harmless files.
const SNIFF_BYTES: u64 = 8 * 1024;

/// Name parts that mark a file meant to be committed as a template.
const TEMPLATE_PARTS: [&str; 7] = [
    "example", "sample", "template", "dist", "defaults", "schema", "tpl",
];

const KEY_NAMES: [&str; 4] = ["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"];

/// Key material whatever it contains.
const KEY_EXTENSIONS: [&str; 6] = ["p12", "pfx", "jks", "keystore", "p8", "ppk"];

/// Also used by public certificates (`.pem`) and Keynote decks (`.key`), so
/// these count only when the content holds a private key.
const MAYBE_KEY_EXTENSIONS: [&str; 2] = ["pem", "key"];

/// `git ls-files -z -t` over the names `classify` recognises. `-t` tags
/// committed paths `H` (or another index state) and untracked ones `?`;
/// `--directory` stops the walk at untracked directories such as an unignored
/// `node_modules`.
pub const LISTING: [&str; 31] = [
    "ls-files",
    "-z",
    "-t",
    "--cached",
    "--others",
    "--exclude-standard",
    "--directory",
    "--",
    ":(glob)**/.env",
    ":(glob)**/.env.*",
    ":(glob)**/*.env",
    ":(glob)**/id_rsa",
    ":(glob)**/id_dsa",
    ":(glob)**/id_ecdsa",
    ":(glob)**/id_ed25519",
    ":(glob)**/*.pem",
    ":(glob)**/*.key",
    ":(glob)**/*.p12",
    ":(glob)**/*.pfx",
    ":(glob)**/*.jks",
    ":(glob)**/*.keystore",
    ":(glob)**/*.p8",
    ":(glob)**/*.ppk",
    ":(glob)**/credentials",
    ":(glob)**/*credentials*.json",
    ":(glob)**/service-account*.json",
    ":(glob)**/client_secret*.json",
    ":(glob)**/*.tfstate",
    ":(glob)**/.npmrc",
    ":(glob)**/.pypirc",
    ":(glob)**/.netrc",
];

fn is_env(name: &str) -> bool {
    name == ".env" || name.starts_with(".env.") || (name.len() > 4 && name.ends_with(".env"))
}

fn is_template(name: &str) -> bool {
    name.split(['.', '-', '_'])
        .any(|part| TEMPLATE_PARTS.contains(&part))
}

/// A registry setting that carries a literal credential rather than a
/// `${VARIABLE}` reference to one. A key counts only when `=` or `:` follows
/// it, so `_auth` does not match inside `_authToken`.
fn has_literal_credential(text: &str, keys: &[&str]) -> bool {
    text.lines().any(|line| {
        keys.iter().any(|key| {
            line.match_indices(key).any(|(at, _)| {
                let rest = line[at + key.len()..].trim_start();
                let Some(value) = rest.strip_prefix(['=', ':']) else {
                    return false;
                };
                let value = value.trim();
                !value.is_empty() && !value.starts_with("${")
            })
        })
    })
}

/// What kind of secret a path holds, if any. `sniff` reads the start of the
/// file and is only called for names shared with harmless files.
pub fn classify(path: &str, sniff: impl Fn() -> Option<String>) -> Option<SecretKind> {
    let name = path.rsplit('/').next().unwrap_or(path).to_ascii_lowercase();
    if name.is_empty() || name.ends_with(".pub") {
        return None;
    }
    if is_env(&name) {
        return (!is_template(&name)).then_some(SecretKind::Env);
    }

    let extension = name.rsplit_once('.').map(|(_, extension)| extension);
    if KEY_NAMES.contains(&name.as_str())
        || extension.is_some_and(|extension| KEY_EXTENSIONS.contains(&extension))
    {
        return Some(SecretKind::PrivateKey);
    }
    if extension.is_some_and(|extension| MAYBE_KEY_EXTENSIONS.contains(&extension)) {
        return sniff()
            .filter(|text| text.contains("PRIVATE KEY"))
            .map(|_| SecretKind::PrivateKey);
    }

    let credentials_json = extension == Some("json")
        && (name.contains("credentials")
            || name.starts_with("service-account")
            || name.starts_with("client_secret"));
    if (name == "credentials" || extension == Some("tfstate") || credentials_json)
        && !is_template(&name)
    {
        return Some(SecretKind::Credentials);
    }

    match name.as_str() {
        ".netrc" => Some(SecretKind::Token),
        ".npmrc" => sniff()
            .filter(|text| has_literal_credential(text, &["_authToken", "_auth", "_password"]))
            .map(|_| SecretKind::Token),
        ".pypirc" => sniff()
            .filter(|text| has_literal_credential(text, &["password"]))
            .map(|_| SecretKind::Token),
        _ => None,
    }
}

fn sniff(root: &Path, relative: &str) -> Option<String> {
    let mut buffer = Vec::new();
    std::fs::File::open(root.join(relative))
        .ok()?
        .take(SNIFF_BYTES)
        .read_to_end(&mut buffer)
        .ok()?;
    Some(String::from_utf8_lossy(&buffer).into_owned())
}

/// Reads the output of `git ls-files` run with `LISTING` in `root`.
pub fn exposed(root: &Path, listing: Option<&str>) -> Vec<ExposedSecret> {
    let Some(listing) = listing else {
        return Vec::new();
    };
    listing
        .split('\0')
        .filter_map(|entry| {
            let (tag, path) = entry.split_once(' ')?;
            let kind = classify(path, || sniff(root, path))?;
            Some(ExposedSecret {
                path: path.to_owned(),
                committed: tag != "?",
                kind,
            })
        })
        .take(MAX_EXPOSED)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{classify, exposed, ExposedSecret, SecretKind};
    use std::path::Path;

    fn kind(path: &str) -> Option<SecretKind> {
        classify(path, || None)
    }

    fn kind_with(path: &str, content: &str) -> Option<SecretKind> {
        classify(path, || Some(content.to_owned()))
    }

    #[test]
    fn env_files_with_values_are_recognised() {
        for path in [
            ".env",
            ".env.local",
            ".env.production",
            "apps/web/.env.development.local",
            "prod.env",
            "config/.ENV",
        ] {
            assert_eq!(kind(path), Some(SecretKind::Env), "{path}");
        }
    }

    #[test]
    fn templates_and_lookalikes_are_not_secrets() {
        for path in [
            ".env.example",
            ".env.sample",
            ".env.template",
            ".env.dist",
            ".env.defaults",
            ".env.local.example",
            "example.env",
            "credentials.example.json",
            ".envrc",
            "environment.ts",
            "env",
            ".env/",
            "packages/",
            "id_rsa.pub",
            "google-services.json",
            "GoogleService-Info.plist",
        ] {
            assert_eq!(kind(path), None, "{path}");
        }
    }

    #[test]
    fn key_files_are_private_keys_whatever_they_hold() {
        for path in [
            "id_rsa",
            "deploy/id_ed25519",
            "ios/dist.p12",
            "android/release.keystore",
            "upload.jks",
            "AuthKey_ABC123.p8",
            "server.pfx",
        ] {
            assert_eq!(kind(path), Some(SecretKind::PrivateKey), "{path}");
        }
    }

    #[test]
    fn pem_and_key_count_only_with_a_private_key_inside() {
        let private = "-----BEGIN RSA PRIVATE KEY-----\nMIIE";
        let certificate = "-----BEGIN CERTIFICATE-----\nMIID";
        assert_eq!(
            kind_with("certs/server.pem", private),
            Some(SecretKind::PrivateKey)
        );
        assert_eq!(
            kind_with("certs/server.key", private),
            Some(SecretKind::PrivateKey)
        );
        assert_eq!(kind_with("certs/ca.pem", certificate), None);
        assert_eq!(kind_with("Pitch.key", "PK\u{3}\u{4}"), None);
    }

    #[test]
    fn credential_files_are_recognised() {
        for path in [
            ".aws/credentials",
            "credentials.json",
            "gcp-credentials.json",
            "service-account-prod.json",
            "client_secret_123.json",
            "infra/terraform.tfstate",
        ] {
            assert_eq!(kind(path), Some(SecretKind::Credentials), "{path}");
        }
    }

    #[test]
    fn registry_files_count_only_with_a_literal_credential() {
        assert_eq!(
            kind_with(".npmrc", "//registry.npmjs.org/:_authToken=npm_abc123"),
            Some(SecretKind::Token)
        );
        assert_eq!(
            kind_with(".npmrc", "//registry.npmjs.org/:_authToken=${NPM_TOKEN}"),
            None
        );
        assert_eq!(
            kind_with(
                ".npmrc",
                "save-exact=true\nregistry=https://registry.npmjs.org/"
            ),
            None
        );
        assert_eq!(
            kind_with(
                ".pypirc",
                "[pypi]\nusername = __token__\npassword = pypi-AgEI"
            ),
            Some(SecretKind::Token)
        );
        assert_eq!(kind_with(".pypirc", "[pypi]\nusername = __token__"), None);
        assert_eq!(kind(".netrc"), Some(SecretKind::Token));
    }

    #[test]
    fn committed_and_unignored_files_are_told_apart() {
        let listing = "H .env.production\0? deploy/id_rsa\0? node_modules/\0H .env.example\0";
        assert_eq!(
            exposed(Path::new("/nonexistent"), Some(listing)),
            vec![
                ExposedSecret {
                    path: ".env.production".into(),
                    committed: true,
                    kind: SecretKind::Env
                },
                ExposedSecret {
                    path: "deploy/id_rsa".into(),
                    committed: false,
                    kind: SecretKind::PrivateKey
                },
            ]
        );
        assert!(exposed(Path::new("/nonexistent"), None).is_empty());
    }
}
