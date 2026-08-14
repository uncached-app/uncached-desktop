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

### `available_launchers`

No request. Returns the editors and terminals this machine was found to have.

```json
[{ "id": "zed", "name": "Zed", "kind": "editor", "program": "Zed" }]
```

`program` is what the platform's launcher understands — an application name on macOS, an executable on PATH everywhere else. Detected by looking on disk rather than by asking Launch Services, because every way of asking goes through `open` and can put a window in front of the user as a side effect of drawing a menu.

### `reveal_project` / `open_project_with`

`{ "path": "/work/api" }`, and `{ "path": "/work/api", "program": "Zed" }`.

Both refuse a path that is not inside one of `workspaceRoots`, compared component-wise on canonical paths — `/work-archive` is not inside `/work` however the two are spelled. `open_project_with` also refuses a `program` that is not in `available_launchers`: a caller that could name any program could start any process, and these commands exist to open an editor.

### `project_hygiene`

Request: `{ "path": "/work/api" }`. Read-only, offline, Free on every plan.

```json
{
  "deadBranches": [
    { "name": "feature/x", "state": "prunable", "lastCommitAt": 1699000000 }
  ],
  "stashes": [{ "reference": "stash@{0}", "message": "WIP on main", "at": 1680000000 }],
  "worktrees": [{ "path": "/w/api-hotfix", "branch": "hotfix", "missing": false, "primary": false }]
}
```

A dead branch is one whose upstream Git reports as `gone` — the shape a merged
pull request leaves behind. `state` splits them in two, and the split is the
point: `prunable` means `git branch --merged HEAD` lists it, so `git branch -d`
will accept it; `holdsWork` means its commits are reachable from nowhere else
here, and it is reported and never offered for deletion. The checked-out branch
is never listed, because Git will not delete it.

`gone` is only accurate after a fetch with `--prune`, so the interface reads
`git.lastFetchAt` beside this and says when the answer was last checked.

The primary worktree is filtered out. `missing` means the registration in
`.git/worktrees` outlived the directory it points at.

### `fetch_project`

Request: `{ "path": "/work/api" }`. The app's only network operation.

```json
{ "hygiene": { }, "fetchedAt": 1755000000 }
```

`git fetch --prune`: it rewrites `refs/remotes/*` and nothing else — never a
local branch, a commit or a file — and it never merges. `pull` is deliberately
not exposed. Prompting is disabled on every channel (`GIT_TERMINAL_PROMPT`,
`GIT_ASKPASS`, `SSH_ASKPASS`, `GIT_SSH_COMMAND` with `BatchMode=yes`), because a
repository that wants a password would otherwise wait for a terminal that does
not exist. A failure returns Git's own first line of stderr.

The re-read hygiene comes back with it: a fetch that changed nothing still has to
return an answer, because the interface is showing the previous one.

### `prune_branches`

Request: `{ "path": "/work/api", "branches": ["feature/x"] }`

```json
{
  "deleted": ["feature/x"],
  "refused": [{ "name": "feature/y", "reason": "not fully merged" }],
  "hygiene": { }
}
```

The names are re-checked against a freshly read report rather than trusted — the
interface sends what it was showing, which may be a minute old — and the deletion
itself is `git branch -d`, never `-D`. Git's reachability check is the last word,
so a stale list costs a refusal and never a commit. A batch that half worked says
which half.

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

### `preview_maintenance`

Request: `{ "candidates": [...], "policy": { "minIdleDays": 90, "minBytes": 524288000 } }`

A candidate is `{ path, name, verdict, idleDays, reclaimableBytes }`, where `idleDays` and
`reclaimableBytes` are nullable — an unmeasured project is unknown, never zero. Every field was
produced by the backend, so the frontend carries facts back rather than deriving them.

Raw response:

```json
{
  "selected": [{ "path": "/w/old", "name": "old", "bytes": 23622320128, "idleDays": 218 }],
  "skipped": [{ "path": "/w/api", "name": "api", "reason": "tooRecent", "verdict": "safe" }],
  "bytes": 23622320128,
  "protectedCount": 1
}
```

`reason` is one of `verdict`, `unmeasured`, `unknownActivity`, `tooRecent`, `tooSmall`. Skipped
entries are returned rather than counted in the backend because a policy that quietly matches
nothing is indistinguishable from a broken one. Free on every plan: reading is not the capability
being sold.

### `maintenance_targets`

Same request shape as `preview_maintenance`. Raw response is a list of target ids:

```json
["scan-1-abc123", "scan-1-def456"]
```

The selection is made in Rust from the same function the preview uses; a caller never sends the
projects. What comes back are ids into the current scan session's registry, matched against the
selected projects component-wise on paths — `/w/api-old` is not inside `/w/api`. Targets that are
not cleanable, still being sized, or whose size failed are left out, because cleanup refuses them.

An empty list when no scan session is live is the expected answer, not an error. Requires Pro;
without it the command fails. The removal still goes through `clean_target`, one id at a time, and
maintenance always passes `mode: "Trash"`.

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

`maintenance` is a stored block, `{ minIdleDays, minBytes }`, defaulting to 90 days and 500 MiB. A settings file written before it existed loads and takes the default, like every other field.

There is no background-fetch setting. Fetch is something the user asks for, one repository at a time; running it on a schedule needs the same scheduler the maintenance policy is waiting on, and neither is dressed as existing.

## Workspace index

`scan_workspace_index` project entries carry `git.behind` and `git.lastFetchAt`. `behind` is the largest distance across branches that have an upstream — not the sum, which would describe no branch that exists — and is `null` when nothing has an upstream to be behind. `lastFetchAt` is the modification time of `.git/FETCH_HEAD`, and `null` means the repository has never been fetched.

Neither reaches `recoverability`. Being behind says something exists elsewhere, not that something here is at risk, and letting it decide would make a `git fetch` change what may be deleted unattended.

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
