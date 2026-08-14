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

Commands return their documented result shape. Commands that cross the Core
public contract boundary return v1 envelopes; failures are envelope `error`
objects, never raw Rust `String` errors or native error details.

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

An optional `trigger` is `Manual` or `Scheduled`, defaulting to `Manual`. It is recorded with the cleanup and never changes what the command does — only what the history says about who asked for it.

### `cleanup_history`

No request. Returns `{ "events": [...], "totals": {...} }`, and returns both empty on Free, where nothing is written down.

```json
{
  "at": "2026-08-14T11:02:14Z",
  "freedBytes": 4194304,
  "category": "NodeModules",
  "path": "/work/api/node_modules",
  "workspace": "/work",
  "mode": "Trash",
  "trigger": "Manual"
}
```

One event per cleaned target, appended when the removal succeeded. Every field past `at` and `freedBytes` is `null` on an event written before that field existed; the report groups those as unrecorded rather than guessing. The whole log is returned unaggregated because filtering a report is interactive, and a round trip per filter change would make the screen feel like a query console.

Response is a v1 envelope. Success data contains the command result; failure
uses `data: null` and sanitized Core `error` information.

```json
{
  "apiVersion": "v1",
  "platform": "windows",
  "data": {
    "success": true,
    "targetPath": "C:\\Users\\User\\Projects\\my-app\\node_modules",
    "freedBytes": 524288000,
    "sizeHasErrors": false,
    "modeUsed": "Trash",
    "message": null
  },
  "error": null
}
```

`targetPath` and `message` are command-level fields. Cleanup events use a
separate Desktop event DTO and intentionally omit `targetPath`.

### `cancel_cleanup`

Request: `{ "targetId": "scan-1-abc123" }`

Raw response: `{ "cancelled": true }`. Cancellation only wins before cleanup execution begins; otherwise it returns false.

### `cleanup_capabilities`

Response is a v1 envelope containing:

```json
{
  "apiVersion": "v1",
  "platform": "windows",
  "data": { "permanentCleanup": true, "moveToTrash": true, "secureIdentity": true },
  "error": null
}
```

`permanentCleanup` and `moveToTrash` gate available cleanup modes. On Windows,
`moveToTrash` is runtime-probed: it is `true` when Shell `IFileOperation`
activation succeeds and `false` when that backend is unavailable. It remains
`false` on non-Windows platforms. `secureIdentity` reports whether platform
identity checks are supported. These booleans are capability facts, not
authorization; the backend still performs the final target and policy checks.

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
| `scan:failed` | `scanId`, nested sanitized `error` |
| `clean:started` | `targetId`, `mode` |
| `clean:finished` | `targetId`, `freedBytes`, `sizeHasErrors` |
| `clean:failed` | failure envelope; no data |

`scan:target_found` target fields are `id`, `path`, `name`, `category`, `sizeBytes`, `sizePending`, `sizeHasErrors`, `formattedSize`, and nullable `lastModified`. The target has no `identity` field.

`scan:cancelled` replaces `scan:finished`. `scan:finished` is emitted only after traversal and all sizing jobs settle. A sizing error remains visible in the target via `sizeHasErrors`; it does not turn the scan into `scan:failed`. A scan failure carries its `scanId` inside `data`, alongside sanitized Core error information, so late failures cannot clear a newer scan.

Cleanup success is named `clean:finished`, not `clean:success`. Cleanup failure uses the public Core error shape and never exposes native error text. A cancelled cleanup is reported as `clean:failed` with the mapped public error.

## Error handling and migration

Envelope errors contain exactly `code`, `message`, `path`, and `operation`.
`code` must be one of the stable snake_case values defined in
`uncached-core/CONTRACT_V1.md`; `message` must be a string; `path` and
`operation` are required keys whose values may be strings or null. Native
sources and private error details are excluded. The frontend converts a valid
envelope error to `ApiContractError`; malformed envelopes, unknown error codes,
and unknown versions become explicit IPC contract failures.

v2 must use an explicit versioned contract and adapter. v1 consumers must reject v2 rather than silently accepting changed fields or semantics. Add v2 support only after both producer and consumer have a deliberate migration path.

The CLI remains a current-shape consumer and is explicitly not migrated to these v1 envelopes in this task. Do not change CLI behavior as part of Desktop IPC work.
