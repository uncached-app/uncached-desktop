# Shared Task 2

## Final regression fix

- Added `clean_to_trash_with_delete` as a safe injected deletion boundary.
- `clean_to_trash` still delegates to `trash::delete` and preserves existing error mapping.
- Symlinked-ancestor regression now spies on deletion and asserts `delete_calls == 0`.

## Verification

- `cargo test -p uncached-core rejects_symlinked_target_parent_before_trash`: pass, 1 test.
- `cargo test -p uncached-core`: pass, 12 integration tests and 0 doc-test failures.
- `cargo clippy -p uncached-core --all-targets --all-features -- -D warnings`: pass.
- `cargo fmt --all -- --check`: pass.
- `cargo test --workspace`: pass, 32 app tests and 12 core integration tests.
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`: blocked by existing unrelated lints in `src/filesystem/paths.rs`, `src/filesystem/permissions.rs`, `src/filesystem/size.rs`, `src/scanner/mod.rs`, and `src/services/scan_service.rs`.

## Concern

Workspace clippy remains non-clean because `-D warnings` promotes five pre-existing app lints to errors. Core crate has no clippy warnings.

## Cleanup Cancellation Task 2 Review Fix

Date: 2026-08-08

- `cancel_scan` no longer removes cleanup controls. Legacy `release_target` and `remove_target` also leave cleanup-control lifecycle to cleanup-specific APIs.
- Added deterministic barrier/channel coverage for two concurrent cleanup claims on one target: exactly one claim succeeds, one rejects, and registry state is released.
- Added regression coverage proving scan cancellation leaves an active cleanup control available to `cancel_cleanup`.
- Tauri/clean service wiring remains unchanged.

### Verification

| Command | Result |
| --- | --- |
| Focused scan-service tests with local core override | PASS, 21 passed, 0 failed |
| Desktop `cargo clippy --all-targets --config 'patch."ssh://git@github.com/uncached-app/uncached-core.git".uncached-core.path="../../uncached-core"' -- -D warnings` | PASS |
| Desktop `cargo fmt --all -- --check` | BLOCKED by pre-existing blank line in `src-tauri/src/commands/mod.rs` |
| Desktop full `cargo test` with local core override | 49 passed, 2 pre-existing environment-dependent cleanup failures |

Full-test failures are `active_non_node_modules_category_uses_core_trash_cleanup` and `node_modules_cleanup_preserves_existing_size_error`; both require Windows secure Trash behavior unavailable in this environment.

## Final Cleanup Cancellation Review Fix

Date: 2026-08-08

- `clean_target` now maps `NukeError::CleanupCancelled` to `clean:failed` with `cancelled: true`, preserving `targetId` and message. Success is emitted only for successful service results.
- All cleanup failures now include explicit `cancelled: false` unless they are cancellation errors. IPC documentation reflects the schema.
- `release_target` and `remove_target` now share claim-release cleanup with cleanup-specific lifecycle methods, preventing stale `cleanup_controls` while preserving scan cancellation behavior.
- Added deterministic command/service event coverage and legacy release/remove registry coverage. No sleeps or changes to scan cancellation or mid-execution semantics.

### Verification

| Command | Result |
| --- | --- |
| Focused cancellation event test with local core override | PASS |
| Focused legacy cleanup-control tests with local core override | PASS: 2 tests |
| `cargo fmt --all -- --check` | PASS |
| Desktop full `cargo test` with local core override | 54 passed, 2 pre-existing environment-dependent secure Trash failures |
| Desktop `cargo clippy --all-targets -- -D warnings` with local core override | PASS |

Full-test failures remain `active_non_node_modules_category_uses_core_trash_cleanup` and `node_modules_cleanup_preserves_existing_size_error`; both fail because secure Windows Trash is unavailable in this environment.

## Final Cleanup Cancellation Ordering Review Fix

Date: 2026-08-08

- `ScanService::finish_cleanup` now retrieves and finishes the `CleanupControl` before removing cleanup control and target authorization.
- Added lifecycle coverage proving a retained control rejects cancellation after `finish_cleanup`, even when it was still in `Preparing`.
- Scan behavior and post-execution cancellation semantics remain unchanged.

### Verification

| Command | Result |
| --- | --- |
| Focused cleanup lifecycle tests with local core override | PASS |
| Desktop `cargo fmt --all -- --check` | PASS |
| Desktop `cargo clippy --all-targets --config 'patch."ssh://git@github.com/uncached-app/uncached-core.git".uncached-core.path="../uncached-core"' -- -D warnings` | PASS |
| Desktop full `cargo test` with local core override | 55 passed, 2 pre-existing environment-dependent secure Trash failures |

Full-test failures remain `active_non_node_modules_category_uses_core_trash_cleanup` and `node_modules_cleanup_preserves_existing_size_error`; both fail because secure Windows Trash is unavailable in this environment.
