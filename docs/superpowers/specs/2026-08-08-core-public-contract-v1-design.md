# Core Public Contract v1 Design

## Goal

Define stable, versioned contracts between `uncached-core` and Desktop IPC for
scan results, sizing, cleanup, capabilities, and public errors without exposing
internal filesystem/security types or breaking existing consumers immediately.

## Why

Uncached now has independent Core, Desktop, and CLI consumers, platform-specific
cleanup backends, asynchronous scan events, and future provider expansion. A
versioned boundary prevents internal model changes from silently breaking IPC,
keeps errors safe for UI, and lets capabilities reflect real backend support.

## Versioning strategy

Use an additive envelope with `apiVersion: "v1"`. Do not move all existing
models into a breaking namespace in this iteration.

Existing Core models and functions remain available during migration. New v1
DTOs are separate transport types and must not be aliases of internal domain
models. Incompatible changes require `v2`; existing v1 fields never change
meaning or disappear.

## Surfaces

This iteration covers:

- `uncached-core` public Rust/Serde DTOs;
- Desktop Tauri commands and events.

CLI remains on its current API during this migration and can adopt v1 later.

## Core contract module

Add:

```text
uncached-core/src/contract/
  mod.rs
  v1.rs
```

Public v1 types:

```rust
pub const API_VERSION: &str = "v1";

pub struct ApiEnvelope<T> {
    pub api_version: String,
    pub platform: Platform,
    pub data: Option<T>,
    pub error: Option<CoreErrorInfo>,
}

pub enum Platform {
    Windows,
    Linux,
    Macos,
    Android,
    Unsupported,
}

pub struct CleanupCapabilities {
    pub permanent_cleanup: bool,
    pub move_to_trash: bool,
    pub secure_identity: bool,
}

pub struct ScanTargetDto {
    pub path: String,
    pub category: Category,
    pub size_bytes: u64,
    pub size_pending: bool,
    pub size_has_errors: bool,
}

pub struct CleanupResultDto {
    pub success: bool,
    pub target_path: String,
    pub freed_bytes: u64,
    pub size_has_errors: bool,
}
```

All v1 DTOs derive the required Serde traits. IPC fields use camelCase. Core
internal `FileIdentity` is never exposed to the frontend. Public paths and
messages must follow existing sanitization rules.

## Capabilities

Expose a public capability query:

```rust
pub fn cleanup_capabilities() -> CleanupCapabilities;
```

Values come from the actual platform backend, not hardcoded UI assumptions:

- `permanent_cleanup` reflects secure permanent-delete support;
- `move_to_trash` reflects secure Trash/Recycle Bin support;
- `secure_identity` reflects whether target identity validation is available.

Capabilities describe operation availability, not guaranteed success for every
target. A target can still fail policy, identity, size, or filesystem checks.

## Public errors

`CoreErrorCode` and `CoreErrorInfo` remain the public error contract. Wrap them
in the same v1 response envelope at IPC boundaries, with exactly one of
`data` or `error` present:

```json
{
  "apiVersion": "v1",
  "platform": "windows",
  "data": null,
  "error": {
    "code": "secure_trash_unavailable",
    "message": "secure Trash is unavailable",
    "path": null,
    "operation": null
  }
}
```

`code` remains stable snake_case. `message` is safe for UI and public logs.
Native error details stay in internal logs. New fields are optional; existing
codes never change meaning. Unknown codes or versions must produce explicit
frontend errors rather than silent fallback.

## Desktop IPC migration

Migrate these events to v1 envelopes:

- `scan:target_found`;
- `scan:target_sized`;
- `scan:finished`;
- `scan:failed`;
- `clean:started`;
- `clean:finished`;
- `clean:failed`.

Example:

```json
{
  "apiVersion": "v1",
  "platform": "windows",
  "data": {
    "targetId": "scan-1-target",
    "sizeBytes": 123,
    "sizePending": false,
    "sizeHasErrors": false
  }
}
```

Frontend validates `apiVersion` before applying payload. Payloads with unknown
versions are rejected explicitly. Optional additive fields do not break v1
consumers.

Commands exposing capabilities and errors use the same envelope shape. Existing
internal Desktop models may remain as conversion-layer types during migration.

## Compatibility policy

1. Add v1 DTOs and serializers without removing current models.
2. Expose capabilities.
3. Migrate sizing and scan-finished events.
4. Migrate public IPC errors.
5. Migrate cleanup events.
6. Add contract serialization and consumer tests.
7. Deprecate old transport shapes only after all Desktop consumers migrate.

No field removal or semantic reuse is permitted within v1. A breaking change
creates a new version and an explicit migration path.

## Testing

Core tests must cover:

- exact JSON shape for every v1 envelope;
- `apiVersion == "v1"`;
- platform serialization;
- capability values for supported and unsupported backends;
- round-trip DTO serialization;
- all existing `CoreErrorCode` values and stable snake_case;
- absence of native error details and `FileIdentity` from public DTOs.

Desktop tests must cover:

- every migrated event includes v1 envelope and platform;
- unknown API version is rejected;
- optional fields remain compatible;
- capabilities control available UI actions;
- sizing errors remain visible and cleanup-blocked;
- cleanup errors preserve backend authorization and identity validation.

## Non-goals

- Do not migrate CLI in this iteration.
- Do not expose filesystem identities to frontend.
- Do not replace backend authorization with capability checks.
- Do not change cleanup security behavior.
- Do not make error messages contain native details.
- Do not remove current models before consumer migration is complete.
