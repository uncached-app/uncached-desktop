# IPC and Events

This document describes the current React/Tauri boundary. Rust remains authoritative for workspace validation, target authorization, cleanup policy, and filesystem operations.

## Wire conventions

Event payloads and the `cleanup_capabilities` result use Core Contract v1 envelopes. Every envelope has exactly these keys:

```json
{
  "apiVersion": "v1",
  "platform": "windows",
  "data": {},
  "error": null
}
```

`platform` is one of `windows`, `linux`, `macos`, `android`, or `unsupported`. Success has non-null `data` and null `error`; failure has null `data` and non-null `error`. Fields use `camelCase`. `FileIdentity` and native error sources never cross this boundary.

The frontend accepts only `apiVersion: "v1"`. Unknown versions fail explicitly and are not interpreted as v1. Core's deserializer preserves the version string; version acceptance belongs to the consuming adapter.

## Commands

Unless explicitly shown as an envelope below, Tauri commands currently return raw command results. Callers validate each result before using it.

### `start_scan`

Request: `{ "path": "C:\\Users\\User\\Projects" }`

Raw response:

```json
{ "scanId": "scan-1" }
```

The root must exist, be a real directory, and not be a symbolic link. Scanning continues on a worker and emits events.

### `cancel_scan`

Request: `{ "scanId": "scan-1" }`

Raw response: `{ "cancelled": true }`

Cancellation invalidates the session. Targets from that session are removed and cannot be cleaned. Repeated cancellation returns `{ "cancelled": false }`.

### `retry_target_size`

Request: `{ "targetId": "scan-1-abc123" }`

Raw response:

```json
{
  "scanId": "scan-1",
  "targetId": "scan-1-abc123",
  "sizeBytes": 524288000,
  "sizeHasErrors": false,
  "sizePending": false,
  "formattedSize": "500.00 MB"
}
```

The command also emits `scan:target_sized` with the same DTO in a v1 success envelope.

### `clean_target`

Request:

```json
{
  "request": {
    "targetId": "scan-1-abc123",
    "mode": "Trash",
    "confirmation": null
  }
}
```

`mode` is `Trash` or `Permanent`. `Permanent` requires exact confirmation `"Nuke"`. The backend resolves `targetId` from its in-memory registry; a frontend path is not accepted as authority.

Raw response:

```json
{
  "success": true,
  "targetPath": "C:\\Users\\User\\Projects\\my-app\\node_modules",
  "freedBytes": 524288000,
  "sizeHasErrors": false,
  "modeUsed": "Trash",
  "message": null
}
```

`targetPath` and `message` are command-level fields. Cleanup events intentionally publish the narrower `CleanupResultDto` and never publish `targetPath`.

### `cancel_cleanup`

Request: `{ "targetId": "scan-1-abc123" }`

Raw response: `{ "cancelled": true }`. Cancellation only wins before cleanup execution begins; otherwise it returns false.

### `cleanup_capabilities`

Response is a v1 success envelope containing:

```json
{
  "apiVersion": "v1",
  "platform": "windows",
  "data": { "permanent": true, "trash": false, "secureIdentity": true },
  "error": null
}
```

`permanent` and `trash` gate available cleanup modes. `secureIdentity` reports whether platform identity checks are supported. These booleans are capability facts, not authorization; the backend still performs the final target and policy checks.

### Settings and app info

`get_settings`, `update_settings`, and `get_app_info` currently return raw command DTOs. Their fields are camelCase. Settings persistence is implemented in `settings.json`; missing settings use safe defaults, while invalid or unreadable settings return command errors.

## Events

All events are emitted by Tauri with a v1 envelope. Event names are exact and case-sensitive:

| Event | Envelope data |
| --- | --- |
| `scan:started` | `scanId`, `rootPath` |
| `scan:target_found` | `scanId`, `target` |
| `scan:target_sized` | `scanId`, `targetId`, `sizeBytes`, `sizePending`, `sizeHasErrors`, `formattedSize` |
| `scan:progress` | `scanId`, `directoriesScanned`, `targetsFound`, `totalBytesFound` |
| `scan:finished` | `scanId`, `totalTargets`, `totalBytesFound`, `durationMs` |
| `scan:cancelled` | `scanId`, `totalTargets`, `totalBytesFound` |
| `scan:failed` | failure envelope; no data |
| `clean:started` | `targetId`, `mode` |
| `clean:finished` | `targetId`, `freedBytes`, `sizeHasErrors` |
| `clean:failed` | failure envelope; no data |

`scan:target_found` target fields are `id`, `path`, `name`, `category`, `sizeBytes`, `sizePending`, `sizeHasErrors`, `formattedSize`, and nullable `lastModified`. The target has no `identity` field.

`scan:cancelled` replaces `scan:finished`. `scan:finished` is emitted only after traversal and all sizing jobs settle. A sizing error remains visible in the target via `sizeHasErrors`; it does not turn the scan into `scan:failed`.

Cleanup success is named `clean:finished`, not `clean:success`. Cleanup failure uses the public Core error shape and never exposes native error text. A cancelled cleanup is reported as `clean:failed` with the mapped public error.

## Error handling and migration

Envelope errors contain `code`, `message`, and nullable `path` and `operation`. Error codes are stable snake_case values defined in `uncached-core/CONTRACT_V1.md`. Native sources and private error details are excluded. The frontend converts a valid envelope error to `ApiContractError`; malformed envelopes and unknown versions become explicit IPC contract failures.

v2 must use an explicit versioned contract and adapter. v1 consumers must reject v2 rather than silently accepting changed fields or semantics. Add v2 support only after both producer and consumer have a deliberate migration path.

The CLI remains a current-shape consumer and is explicitly not migrated to these v1 envelopes in this task. Do not change CLI behavior as part of Desktop IPC work.
