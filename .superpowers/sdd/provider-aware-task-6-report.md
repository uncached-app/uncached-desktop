# Provider-Aware Task 6 Report

## Status

Implemented Desktop Task 6 after core pin `b402f67` and Desktop commits
`92db9ff` and `f5a1784`.

`CleanService::clean_registered_target` now receives `&AppSettings` explicitly.
Trash cleanup reconstructs a core `ScanTarget` for every UI category, builds
the configured provider set with `get_default_providers(settings)`, and calls
`uncached_core::clean_to_trash(root, &providers, &target)`.

Permanent cleanup still uses `PermanentCleaner`; exact `Nuke` confirmation is
unchanged. Existing UI size errors remain aggregated with the core cleanup
report.

## TDD Evidence

RED test command:

```text
cargo test --manifest-path src-tauri/Cargo.toml services::clean_service::tests
```

Failed before implementation because the Desktop call used the old core
cleanup signature and `CleanService` did not accept settings.

GREEN focused result after implementation:

```text
7 passed; 0 failed
```

Regression coverage includes:

- active `CargoTarget` Trash cleanup through core provider validation;
- disabled `CargoTarget` provider rejects cleanup and preserves target;
- invalid `.next` context rejects cleanup and preserves target;
- NodeModules context validation and size-error preservation;
- permanent confirmation behavior.

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml services::clean_service::tests`: passed, 7/7.
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed, 39/39.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: passed.
- `rustfmt --edition 2021 --check src-tauri/src/services/clean_service.rs src-tauri/src/commands/clean.rs src-tauri/src/services/scan_service.rs`: passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: blocked by pre-existing whitespace in `src-tauri/src/commands/mod.rs`, outside Task 6 files.

## Commit Scope

The Task 6 commit contains only:

- `src-tauri/src/services/clean_service.rs`;
- `src-tauri/src/commands/clean.rs`;
- `src-tauri/src/services/scan_service.rs`;
- this report.

Pre-existing `src-tauri/Cargo.toml` and `Cargo.lock` pin changes remain
unstaged and uncommitted. CLI was not modified.

## Concerns

Global formatting remains non-clean because of the existing blank line in
`commands/mod.rs`. No functional test, check, or clippy concerns remain.
