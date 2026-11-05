#!/usr/bin/env bash
# Builds, signs, notarises and uploads both macOS bundles from this Mac into
# `releases/<version>/<triple>/` on R2, the layout the release workflow's
# publish job reads. Run it on the tagged commit, before pushing the tag.
#
# Reads .env.release.local (ignored by `*.local`):
#   APPLE_SIGNING_IDENTITY  "Developer ID Application: …"
#   APPLE_ID, APPLE_PASSWORD (app-specific), APPLE_TEAM_ID
#   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, CLOUDFLARE_ACCOUNT_ID
#   TAURI_SIGNING_PRIVATE_KEY           optional, defaults to ~/.tauri/uncached-updater.key
#   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  optional, empty for a key without one
#
# Usage: scripts/release-mac.sh [--no-upload] [aarch64-apple-darwin|x86_64-apple-darwin ...]

set -euo pipefail

cd "$(dirname "$0")/.."

TRIPLES=()
UPLOAD=1
for argument in "$@"; do
  case "$argument" in
    --no-upload) UPLOAD=0 ;;
    aarch64-apple-darwin | x86_64-apple-darwin) TRIPLES+=("$argument") ;;
    *) echo "Unknown argument: $argument" >&2; exit 2 ;;
  esac
done
[ ${#TRIPLES[@]} -gt 0 ] || TRIPLES=(aarch64-apple-darwin x86_64-apple-darwin)

fail() {
  echo "$*" >&2
  exit 1
}

load_env() {
  [ -f .env.release.local ] || fail "Missing .env.release.local; see the header of this script."
  set -a
  # shellcheck disable=SC1091
  . ./.env.release.local
  set +a

  export TAURI_SIGNING_PRIVATE_KEY="${TAURI_SIGNING_PRIVATE_KEY:-$HOME/.tauri/uncached-updater.key}"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

  local required=(APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID)
  [ "$UPLOAD" = 1 ] && required+=(R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET CLOUDFLARE_ACCOUNT_ID)
  for name in "${required[@]}"; do
    [ -n "${!name:-}" ] || fail "$name is empty in .env.release.local."
  done
}

require_tools() {
  local tools=(pnpm rustup xcrun jq curl)
  [ "$UPLOAD" = 1 ] && tools+=(aws)
  for tool in "${tools[@]}"; do
    command -v "$tool" >/dev/null || fail "$tool is not installed."
  done
  for triple in "${TRIPLES[@]}"; do
    rustup target list --installed | grep -qx "$triple" \
      || fail "Rust target $triple is missing: rustup target add $triple"
  done
  security find-identity -v -p codesigning | grep -qF "$APPLE_SIGNING_IDENTITY" \
    || fail "No signing identity \"$APPLE_SIGNING_IDENTITY\" in the keychain."
}

read_version() {
  local conf pkg crate live
  conf=$(node -p "require('./src-tauri/tauri.conf.json').version")
  pkg=$(node -p "require('./package.json').version")
  crate=$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -1)
  [ "$conf" = "$pkg" ] && [ "$conf" = "$crate" ] \
    || fail "Versions disagree: tauri.conf.json=$conf package.json=$pkg Cargo.toml=$crate"

  live=$(curl -fsS https://cdn.uncached.app/latest.json | jq -r .version)
  [ "$live" != "$conf" ] || fail "$conf is already live; bump the version to release again."
  VERSION="$conf"
}

# The workflow builds a fresh checkout of the tag against core `main`; the
# `[patch]` in src-tauri/.cargo/config.toml makes this build use the sibling
# checkout instead, so both trees are pinned to what CI would see.
require_release_sources() {
  git diff --quiet HEAD -- || fail "uncached-desktop has uncommitted changes."
  [ "$(git tag --points-at HEAD)" = "v$VERSION" ] || fail "HEAD is not tagged v$VERSION."

  local core=../uncached-core
  git -C "$core" diff --quiet HEAD -- || fail "uncached-core has uncommitted changes."
  git -C "$core" fetch --quiet origin main
  [ "$(git -C "$core" rev-parse HEAD)" = "$(git -C "$core" rev-parse origin/main)" ] \
    || fail "uncached-core is not at origin/main, which is what the workflow builds Linux against."
}

build() {
  local triple=$1
  pnpm dmg:clean
  pnpm tauri build --target "$triple" --bundles app,dmg
}

collect() {
  local triple=$1 stage=$2 bundle="target/$1/release/bundle" images
  mkdir -p "$stage"
  rm -f "$stage"/*

  shopt -s nullglob
  images=("$bundle"/dmg/Uncached_"$VERSION"_*.dmg)
  shopt -u nullglob
  [ ${#images[@]} -eq 1 ] || fail "Expected one $VERSION dmg in $bundle/dmg, found ${#images[@]}."
  [ -f "$bundle/macos/Uncached.app.tar.gz.sig" ] \
    || fail "No .sig beside the updater bundle: the updater signing key did not reach this build."

  cp "${images[0]}" "$bundle/macos/Uncached.app.tar.gz" "$bundle/macos/Uncached.app.tar.gz.sig" "$stage/"
  ls -la "$stage"
}

# The bundler notarises the app; the dmg around it is notarised and stapled here.
notarise_image() {
  local image
  image=$(ls "$1"/*.dmg)
  xcrun notarytool submit "$image" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait \
    --timeout 30m
  xcrun stapler staple "$image"
  xcrun stapler validate "$image"
  spctl --assess --type open --context context:primary-signature --verbose "$image"
}

# `--delete` so the prefix holds exactly this build.
upload() {
  local triple=$1 stage=$2
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION=auto \
  AWS_EC2_METADATA_DISABLED=true \
    aws s3 sync "$stage" "s3://$R2_BUCKET/releases/$VERSION/$triple/" \
      --endpoint-url "https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com" \
      --cache-control "public, max-age=31536000, immutable" \
      --delete \
      --only-show-errors
}

# Local cargo drops the committed `git+ssh` source of uncached-core from the
# lockfile; the tagged commit must stay byte-identical to what CI checks out.
restore_lockfile() {
  git restore Cargo.lock 2>/dev/null || true
}

main() {
  load_env
  require_tools
  read_version
  require_release_sources
  trap restore_lockfile EXIT

  for triple in "${TRIPLES[@]}"; do
    local stage="target/release-mac/$VERSION/$triple"
    echo "==> $triple"
    build "$triple"
    collect "$triple" "$stage"
    notarise_image "$stage"
    if [ "$UPLOAD" = 1 ]; then
      upload "$triple" "$stage"
      echo "Uploaded releases/$VERSION/$triple/"
    fi
  done
}

main
