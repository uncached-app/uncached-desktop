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
