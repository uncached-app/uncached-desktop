# Uncached Architecture

## Principles

1. Rust concentrates rules, path validation, authorization, and filesystem operations.
2. React presents state and validates transport data; it does not decide whether an arbitrary path is safe to delete.
3. Scanners and cleaners depend on small, testable traits and services.
4. Long operations run outside the IPC command call and publish events.
5. Core Contract v1 is the public shape for event envelopes and capability data, not a replacement for raw command DTOs.

## Layers

```text
React / Vite
    |
Tauri commands + v1 event envelopes
    |
ScanService / CleanService
    |
uncached-core contract, scanners, cleaners, filesystem models
```

## Contract boundary

`uncached-core::contract::v1` owns the envelope, platform values, public error DTO, capabilities DTO, and transport DTOs. The envelope always contains `apiVersion`, `platform`, `data`, and `error`; exactly one of `data` or `error` is non-null. CamelCase is the serialized field convention. `FileIdentity` stays backend-only.

The Desktop frontend unwraps and validates v1 event envelopes before state changes. `start_scan`, `cancel_scan`, `retry_target_size`, `clean_target`, `cancel_cleanup`, settings commands, and app-info commands currently retain raw Tauri command responses. `cleanup_capabilities` is the envelope-wrapped command because it is part of the shared public contract.

Unknown versions are rejected by the frontend. A future v2 requires an explicit adapter and must not be silently consumed by v1 code. The CLI remains on its current command shape until separately migrated.

## Scan flow

1. Frontend invokes `start_scan` with a path.
2. Backend rejects missing, non-directory, or symlink roots, canonicalizes the root, creates `scanId`, and returns the raw start result.
3. Worker loads settings, creates the configured provider set, and uses Core traversal.
4. Each confirmed target receives a session-scoped ID, backend registration, and a `scan:target_found` event.
5. Bounded sizing workers publish `scan:target_sized` and `scan:progress`.
6. `scan:finished` is emitted only after traversal and every sizing job settle.

Walker pruning prevents traversal into terminal target subtrees. Providers remain behind one `ProviderSet`; adding a provider does not create a second traversal.

Sizing uses `available_parallelism().clamp(1, 8)` workers and a bounded channel. Pending targets remain visible. Sizing errors settle the job and remain visible through `sizeHasErrors`; cleanup rejects pending or errored targets until retry succeeds.

Cancellation invalidates the session and removes its targets after publication barriers settle. It emits `scan:cancelled` instead of `scan:finished`.

## Clean flow

1. Frontend invokes `clean_target` with `targetId`, `mode`, and optional confirmation.
2. Backend claims the registered target; the frontend never supplies an authoritative path.
3. Backend canonicalizes again, rejects links, roots, critical directories, outside-root targets, invalid provider context, missing identity, and identity changes.
4. `TrashCleaner` or `PermanentCleaner` runs in a blocking worker after policy checks.
5. Backend emits `clean:started`, then `clean:finished` or `clean:failed`.

`Permanent` requires exact `Nuke` confirmation. Cleanup capabilities gate UI actions but do not replace backend authorization. Targets and cleanup claims live in memory; restarting the application invalidates prior targets.

## Platform safety

- `canonicalize_target` rejects symlinks and non-real directories.
- `is_within_root` prevents escaping the scan root.
- Volume roots and critical directories are blocked.
- Windows uses the extended path prefix after canonicalization where required.
- Read-only attributes are removed with propagated errors.
- Public errors map to stable Core codes and omit native source details.
