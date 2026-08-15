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
[{ "id": "zed", "name": "Zed", "kind": "editor", "program": "Zed", "specialises": [] }]
```

`specialises` lists the project kinds an editor is built for, and is empty for a general-purpose one. Xcode is why it exists: every Mac with developer tools has it, so on a machine with no other editor installed it was the only thing offered for a React project — a true answer to "what can open this" and a useless one. The interface ranks the specialist for the project's kind first, then the general-purpose editors, then the specialists for other languages.

`program` is what the platform's launcher understands — an application name on macOS, an executable on PATH everywhere else — and it is the name **found on disk**, not the one the table asked for. Matching is by prefix, because editors ship under names a fixed table cannot enumerate (`IntelliJ IDEA Ultimate`, `Visual Studio Code - Insiders`, `Cursor Nightly`, `PyCharm CE`) and an exact match misses every one of them; the shortest match wins, so a nightly beside a stable build does not take its place. The prefix requires a separating space, so `Code` does not claim `CodeRunner`.

Detected by reading the application directories rather than by asking Launch Services, because every way of asking goes through `open` and can put a window in front of the user as a side effect of drawing a menu.

### `reveal_project` / `open_project_with`

`{ "path": "/work/api" }`, and `{ "path": "/work/api", "program": "Zed" }`.

Both refuse a path that is not inside one of `workspaceRoots`, compared component-wise on canonical paths — `/work-archive` is not inside `/work` however the two are spelled. `open_project_with` also refuses a `program` that is not in `available_launchers`: a caller that could name any program could start any process, and these commands exist to open an editor.

An editor goes through the opener. A **terminal does not**, outside macOS. The opener runs `<app> <path>`, and no terminal emulator reads a bare positional path as a working directory: `gnome-terminal /w/api` opens in the home directory, and `cmd.exe C:\w\api` tries to execute the path. On Windows it also passes `CREATE_NO_WINDOW`, which is right for an editor and fatal for a console — the process would start with no window at all. So each terminal is spawned directly with its own documented option (`-d`, `/K cd /d`, `--workdir`, `--directory`, `--working-directory`, `start --cwd`, `-NoExit -Command Set-Location`), and one with no known option is spawned with its working directory set instead. macOS keeps the opener, where `open -a Terminal -- <path>` already means what it looks like.

**Verified on macOS only.** The flags are each terminal's documented option; the other two platforms have not been run.

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

### `duplicate_packages`

Request: `{ "paths": ["/work/api", "/work/web"] }` — project paths, each authorised
against the chosen folders. Read-only on every plan; nothing is moved or offered
for removal.

```json
{
  "packages": [
    {
      "name": "esbuild", "version": "0.28.1", "copies": 9,
      "bytesEach": 42991616, "wastedBytes": 343932928,
      "projects": ["/work/api", "..."], "samplePath": "/work/api/node_modules/esbuild"
    }
  ],
  "wastedBytes": 19542601728,
  "scannedProjects": 14,
  "sharedProjects": 3,
  "distinctPackages": 2187
}
```

Only the top level of each `node_modules` is read: npm and Yarn hoist nearly
every transitive dependency there, and the nested fallback copies are installs
npm chose rather than the user. Identity is `name@version`, so two versions of
one package are two packages and not copies of each other. Copies are counted
per project — one project holding the same package twice is one copy.

**A symlinked entry is never counted**, and a `node_modules` that is mostly links
is reported under `sharedProjects` instead. That is a pnpm install: every package
is a link into one content-addressed store, so the bytes exist once however many
projects point at them. Following those links would report duplication against
the tool that removed it. The majority test exists because npm leaves a few link
entries in an ordinary install.

`bytesEach` is one copy, measured; `wastedBytes` is that times the copies past
the first. Weighing every copy would walk every `node_modules` on the machine to
refine a number whose point is its order of magnitude, so the figure is an
estimate and the screen says so — a package whose install step compiled a native
binary may not be identical across projects. `bytesEach` is `null` when the size
could not be read, and the package stays in the list at zero rather than
vanishing from a total the user is asked to believe.

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

### `maintenance_schedule_status`

No request payload. Raw response:

```json
{
  "schedule": { "enabled": true, "everyHours": 168 },
  "intervalHours": 168,
  "lastRunAt": 1755100800,
  "nextRunAt": 1755705600,
  "held": null,
  "minEveryHours": 24,
  "maxEveryHours": 720,
  "keepsRunningInBackground": true
}
```

Where the unattended schedule stands. `intervalHours` is the interval actually in force, which a
hand-edited settings file can differ from — it is clamped to the two bounds returned beside it, so
a stored zero never becomes a scan without pause. `nextRunAt` is `null` until there has been a run,
and while the schedule is off; neither has a next time that is a fact rather than a guess.

`held` is `null` when a run would start this minute, and otherwise the first reason it would not:
`disabled`, `notLicensed`, `noWorkspace`, `tooSoon` or `scanInProgress`. The order is fixed, so an
expired licence reads as `notLicensed` rather than as perpetually `tooSoon`.

`keepsRunningInBackground` mirrors the setting of the same name, and is not a `held` reason: the
app is running as the status is read, so a run would start. It decides whether there will be a next
one. The schedule is a thread in this process rather than a system service, so with that setting
off, closing the window ends the process and the schedule with it — a schedule enabled beside it is
the one combination the product can promise and fail to deliver, and the screen says so next to the
switch rather than letting it be discovered by nothing happening.

Reading the status is free. The runs themselves are Pro, and the thread that performs them checks
the entitlement again before removing anything.

### `workspace_hygiene`

Request: `{ "paths": ["/Users/me/code/api", "/Users/me/code/web"] }` — the indexed project paths. Every one is authorised like any other path-taking command.

Raw response:

```json
{
  "repositories": [
    { "path": "/Users/me/code/api", "name": "api", "prunable": 2, "hygiene": { "deadBranches": [], "stashes": [], "worktrees": [] } }
  ],
  "examined": 38,
  "deadBranches": 5,
  "prunable": 2,
  "stashes": 3,
  "worktrees": 1
}
```

The same reading `project_hygiene` gives, across the workspace. `repositories` holds only the ones with something to report, ordered by what can be acted on: prunable branches first, then dead branches, then stashes and worktrees. `examined` counts repositories actually read, including the clean ones — a directory with no `.git` is skipped before any process is spawned, because most directories in a workspace are not repositories and `git` in one costs a process to be told so.

Read-only and offline on every plan. It fetches nothing and deletes nothing: pruning stays in `prune_branches`, one repository at a time, and that command re-reads hygiene before it touches a branch. An aggregate prune would put one click between a user and dozens of repositories they had not looked at.

### `orphan_artifacts`

Request: `{ "paths": ["/Users/me/code"] }` — the chosen roots, not the indexed projects. An orphan is defined by there being no project over it, so a list of projects is the one input that cannot contain one. Every path is authorised the same way every other path-taking command authorises one.

Raw response:

```json
{
  "orphans": [
    { "path": "/Users/me/code/old-api/node_modules", "parent": "/Users/me/code/old-api", "label": "Node modules", "bytes": 412000000, "regenerable": true }
  ],
  "bytes": 412000000,
  "examined": 318
}
```

Regenerable directories under those roots that no project claims. `bytes` is `null` on an entry whose size could not be read, and such an entry stays in the list at nothing rather than being dropped — the total is what the user is asked to believe, and quietly shrinking it is worse than admitting a gap. `examined` lets an empty report say it looked.

The rule is narrower than it could be: a directory is an orphan only when neither its own parent nor any ancestor **up to the scanned root** holds an owning manifest. A workspace member whose `package.json` is momentarily missing still sits under the repository's, and that is a project mid-edit. The chain stops at the root, because a manifest outside the folder the user chose is not evidence about anything inside it.

A directory qualifies in one of two ways. Either its name means only one thing — `node_modules`, `.next`, `.turbo`, `.angular`, `.nuxt`, `.svelte-kit` — or its name is ambiguous and a file **inside** it settles the question. `target` is on the list only when it holds a `CACHEDIR.TAG`, whose own specification means the directory contains regenerable data; `venv`, `.venv` and `env` only when they hold a `pyvenv.cfg`, which Python's standard library writes into every environment it creates and nothing else writes. `dist`, `build` and `vendor` have neither and stay out — being wrong here means telling someone a directory they care about belongs to nobody.

`regenerable` is false for a virtual environment and true for everything else. That is the honest exception on this screen: without the project's dependency file no command can rebuild an environment, so it is dead weight because nothing is left that could use it, not because replacing it is cheap.

**Read-only, on every plan, and there is no companion command that removes one.** Cleanup validates each target against the providers, and the providers confirm an artifact by the manifest beside it — which is exactly what an orphan lacks. A button here would be one the backend declines, and relaxing that confirmation to make it work would trade the product's central safety property for a convenience. The finding names the path; `reveal_project` opens it.

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

`preferredEditor` and `preferredTerminal` hold a launcher id, or `null` for automatic. Stored rather than inferred, because there is nothing to infer from: macOS exposes no default-terminal setting at all, and no platform has a default *editor* in any sense an app that opens a directory could read. Automatic means the ranking in `available_launchers` — for an editor, the specialist for the project's own language, then anything general-purpose, then the specialists for other languages; for a terminal, whichever was detected first. A preference naming something no longer installed is ignored rather than obeyed into an empty list.

`maintenanceSchedule` is `{ enabled, everyHours }`, and it is **off by default** — the first unattended deletion on a machine is one the user turned on, never one an install inherited. `maintenanceLastRunAt` is Unix seconds, written by the backend only: it records the last *attempt*, stamped before the work rather than after, so a run interrupted by a crash or a power loss does not come back and immediately try again. A run that correctly selected nothing writes no cleanup log line, which is why the attempt is stored rather than derived from the history.

There is no background-fetch setting. Fetch is something the user asks for, one repository at a time. It could now run on the maintenance thread, but reaching the network unattended is a separate decision from removing a regenerable directory, and it is not dressed as existing.

## Workspace index

`scan_workspace_index` project entries carry `git.behind` and `git.lastFetchAt`. `behind` is the largest distance across branches that have an upstream — not the sum, which would describe no branch that exists — and is `null` when nothing has an upstream to be behind. `lastFetchAt` is the modification time of `.git/FETCH_HEAD`, and `null` means the repository has never been fetched.

Neither reaches `recoverability`. Being behind says something exists elsewhere, not that something here is at risk, and letting it decide would make a `git fetch` change what may be deleted unattended.

An index entry carries no `verdict`. It cannot: the verdict depends on the reclaimable figure, which is measured after the walk, so the field was always `Unknown` and nothing read it. Verdicts come from `assess_projects`, which takes a batch of `{ path, recoverability, activity, reclaimableBytes, installMissing, installStale }` and returns `[path, verdict]` pairs. The path is echoed back rather than the caller zipping the reply against the request by position — a verdict attached to the wrong project is the one mistake the map must not make. Asked as a batch because the answer is a pure function of five scalars and one call per project meant a round trip each, up to 250 of them.

Each entry also carries `restore`, or `null` when nothing there identifies a package manager:

```json
{ "manager": "pnpm", "command": "pnpm install --frozen-lockfile", "pinnedBy": "pnpm-lock.yaml" }
```

`pinnedBy` is the field worth reading. `null` means a reinstall resolves whatever versions are current rather than the ones on disk — the space comes back, that exact tree does not. Nothing else in the index reports this: `installMissing` and `installStale` both begin by finding a lockfile, so a project holding an install that nothing pins passes every other check and reads as healthy.

Detection asks every lockfile before any manifest, and the less common Node managers first, because a stale `package-lock.json` outlives a move to pnpm while nothing but pnpm writes a `pnpm-lock.yaml`. A `packageManager` field in `package.json` outranks all of it — the project stating its own answer — but a manager named there while a different tool's lockfile sits beside it gets the loose command rather than the frozen one, which would fail on a lockfile it cannot read.

`requirements.txt` is reported as pinning nothing. Whether it pins is a parse of a format that is a convention rather than a spec, and being wrong the other way would promise reproducibility this cannot check.

The command is never run. Installing writes to the project, reaches the network, and fails in ways only the project's owner can read.

## Events

All events are emitted by Tauri with a v1 envelope. Event names are exact and case-sensitive:

| Event | Envelope data |
| --- | --- |
| `scan:started` | `scanId`, `rootPath` |
| `scan:target_found` | `scanId`, `target` |
| `scan:target_sized` | `scanId`, `targetId`, `sizeBytes`, `sizePending`, `sizeHasErrors`, `formattedSize` |
| `scan:progress` | `scanId`, `directoriesScanned`, `targetsFound`, `totalBytesFound` |
| `scan:finished` | `scanId`, `totalTargets`, `totalBytesFound`, `durationMs`, `unreadable` |
| `scan:cancelled` | `scanId`, `totalTargets`, `totalBytesFound` |
| `scan:failed` | `scanId`, nested sanitized `error` |
| `clean:started` | `targetId`, `mode` |
| `clean:finished` | `targetId`, `freedBytes`, `sizeHasErrors` |
| `clean:failed` | failure envelope; no data |

`scan:target_found` target fields are `id`, `path`, `name`, `label`, `category`, `plan`, `confidence`, `cleanable`, `sizeBytes`, `sizePending`, `sizeHasErrors` and `formattedSize`. The target has no `identity` field, and no `lastModified`: it was a `metadata` call per target filling a field no screen read.

`scan:finished` carries `unreadable`: folders the walk was not allowed to open, summed across every root. Above zero, both `totalTargets` and `totalBytesFound` are short by whatever is inside them, and the review screen says so rather than presenting either as the whole workspace. On macOS without Full Disk Access that is the ordinary case. The field is defaulted on both sides, so a desktop running against a core that predates it reads zero rather than throwing the event away.

`scan:cancelled` carries what the scan had already found when it stopped, not zeroes. A scan cancelled after finding four gigabytes found four gigabytes, and the step-1 status line says so. `scan:cancelled` replaces `scan:finished`. `scan:finished` is emitted only after traversal and all sizing jobs settle. A sizing error remains visible in the target via `sizeHasErrors`; it does not turn the scan into `scan:failed`. A scan failure carries its `scanId` inside `data`, alongside sanitized Core error information, so late failures cannot clear a newer scan.

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
