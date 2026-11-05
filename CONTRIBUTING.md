# Contributing

Changes land through a pull request. Nothing is pushed straight to `main`, and
every pull request needs a maintainer review before it merges.

## Secrets

Never commit credentials, `.env` files, signing keys, or licence seeds. The
secret scan runs on every pull request and blocks the merge when it finds one.
If you do commit one, treat it as leaked: revoke it first, then clean up the
history.

## Releases

Only maintainers push version tags (`v*`). A tag starts a build that uses the
signing keys and the storage credentials, so it is never a contributor step.

## Cleaners

New categories, catalogue entries, and providers follow `docs/SCANNERS.md`.
Each one needs a test that proves it only removes what it claims to, and
removal goes through the existing safety path (Trash by default, owner checks,
refusal for directories in use). Changing the Free/Pro boundary in
`src-tauri/src/entitlements.rs` needs a maintainer decision, not only a code
review.

## Scope

One concern per pull request. A change that alters public behaviour or the IPC
contract should say so in the description and update `docs/IPC.md`.
