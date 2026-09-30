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

The Desktop frontend unwraps and validates v1 event envelopes before state changes. `clean_target` and `cleanup_capabilities` return v1 command envelopes; other commands retain their documented raw Tauri result shapes. Command failures crossing the v1 boundary are sanitized Core errors, never raw strings.

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
4. `CleanService` calls uncached-core `clean_to_trash` or `clean_permanently` in a blocking worker after policy checks; both go through Core's platform secure cleanup backend.
5. Backend records the removal in history and answers the invoke. Cleanup emits no events: the only party that needs the outcome is the caller, and it is holding the result.

`Permanent` requires exact `Nuke` confirmation. Cleanup capabilities gate UI actions but do not replace backend authorization. Targets and cleanup claims live in memory; restarting the application invalidates prior targets.

## Platform safety

- `canonicalize_target` rejects symlinks and non-real directories.
- `is_within_root` prevents escaping the scan root.
- Volume roots and critical directories are blocked.
- Windows uses the extended path prefix after canonicalization where required.
- Read-only attributes are removed with propagated errors.
- Public errors map to stable Core codes and omit native source details.

## How the app presents itself to the operating system

Three systems each have a screen where the user manages what runs in the
background, and each reads different metadata off the build. Everything they
read is in `bundle` in `tauri.conf.json`: `publisher`, `copyright`, `category`,
`shortDescription`, `longDescription`, `homepage`, and the per-platform blocks
under it. All of these are set. Left empty, which is the Tauri default, the
entries read as a nameless executable by nobody.

**macOS** shows login items under System Settings › General › Login Items &
Extensions. Two things decide how the entry reads there, and neither is a
string in the config.

The first is *which mechanism registers it*. `tauri-plugin-autostart` offers
`LaunchAgent`, which writes a plist in `~/Library/LaunchAgents` pointing at the
executable inside the bundle, and `AppleScript`, which asks System Events to add
a real login item pointing at the `.app`. The plugin's own source says the
first "results in seeing a Unix Executable in macOS login items", which it does.
The second reads correctly and costs an Automation permission prompt that can be
refused — and a refused prompt is autostart silently not working. This app uses
`LaunchAgent`; the trade is open rather than settled.

The second is *signing*. "Item de desenvolvedor não identificado" is macOS
saying the binary carries no Developer ID it can attribute. No configuration
removes that line: it needs a Developer ID Application certificate, a signature,
and notarisation. Release builds have all three — the release workflow signs
with the Developer ID certificate and notarises through `notarytool` — so the
line appears only for local builds. A dev run registers `target/debug/uncached`
— an unsigned bare binary with no bundle at all, which is why the name shows
lowercase there and will not in a release.

**Windows** is not released; the plan is an MSIX through the Microsoft Store,
which signs the package, so no Authenticode setup exists here.

**Linux** has no single such screen; the desktop environment reads
`~/.config/autostart/*.desktop`, whose `Name`, `Comment`, `Icon` and
`Categories` come from the bundle metadata. `bundle.linux.deb.section` places
the package for apt.
