# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Local developers maintaining project workspaces on their own machines. They already know what `node_modules`, a Cargo `target/`, and a `__pycache__` are, and they read interfaces the way they read tool output: counts, paths, sizes, consequences.

## Product Purpose

Uncached finds regenerable build artifacts produced by software projects and reclaims the disk they occupy, without manual hunting through folders. Success means a developer can review detected targets with real byte sizes and move the selected ones to the system Recycle Bin/Trash.

## Positioning

Safety-first cleanup for developer workspaces: Uncached detects known disposable artifacts, requires contextual confirmation, and permits cleanup only for targets registered during the current scan session. The frontend never authorizes arbitrary paths.

The interface is visually calm; the language is not. Copy is spec-terse and written for developers — real artifact names, exact counts, stated consequences, no reassurance. `DESIGN.md` § Voice & Copy is the authority for every string, including error and empty states.

## Operating Context

Users choose or paste a workspace folder, run an asynchronous scan, review detected targets and their estimated sizes, select targets, confirm cleanup, and move them to the native Recycle Bin/Trash. Scan progress and cleanup events update the interface while long operations run.

Step 2 covers two overlapping backend phases, and the interface names both. While the tree walk runs, targets stream in and are sized concurrently. When the walk finishes, sizing usually has not — the step stays open, reporting measurement, until every target has settled. Review opens only once the reported target count is reached and no size is pending. Cancellation is only meaningful during the walk; once it ends there is no operation left to cancel.

## Capabilities and Constraints

- Desktop-first Tauri 2 application with React/Vite frontend and Rust backend.
- Scanner coverage spans the dependency, build and cache directories of every ecosystem the product claims to support; `docs/SCANNERS.md` is the authority on which, and is the only place the list is written down.
- Every detected artifact is confirmed by its ecosystem's marker file sitting beside it, and artifacts that only count in one place are declared as paths relative to the project root rather than as bare directory names.
- No virtual environment and no fetched-dependency directory is ever a target where restoring it costs network rather than a local build.
- Every workspace scanner runs unconditionally. Excluding something inside a workspace is an ignore rule, which reaches every category and wins against the provider, the confidence and a schedule. Settings § Scanning covers only what lives outside the chosen folders: package manager, AI tool and editor caches.
- A command palette reaches every project and every module from the keyboard, and is where a project is opened in an editor, a terminal or the file manager. A project row opens that project's own page: the evidence behind its verdict, its git and activity context, and the artifacts under it, each reclaimable on its own. Opening is a native command: it refuses any path outside the chosen folders, and any application the machine was not found to have.
- `Docker` exists in the category model but has no scanner implementation, and is priced Free for exactly that reason: a plan never charges for a capability that finds nothing.
- A project's own page reports what its repository is carrying that nothing uses: local branches whose remote branch was deleted, forgotten stashes, and worktrees whose directory is gone. Only a branch `git branch -d` would accept is offered for deletion; one holding commits reachable from nowhere else is named and left alone. Stashes and worktrees are reported and never acted on.
- Fetching a repository is the only network operation in the product, is never automatic, and runs with credential prompting disabled. `pull` is not offered: it merges into a working tree, and nothing here writes to one.
- A maintenance policy selects idle projects by verdict, age and size, and Pro runs it — on demand, and on a schedule with nobody present. A scheduled run obeys the same policy, goes through the same cleanup command as a click, always moves to the Recycle Bin/Trash, is recorded in history as started by a schedule, and notifies the user the same day. The schedule is off until switched on, and yields to any scan the user started. It is a thread inside the running application rather than a system service: closing the window keeps it when the app is set to stay in the menu bar, quitting ends it, and a missed run happens the next time the app opens. A schedule enabled while the app is set to quit on close is reported as the contradiction it is, beside the switch that caused it.
- Insights reports the same package installed once per project, on request, as a measured total and a list. It is read-only and offers no removal: a project whose packages are links into a shared store is not duplicating anything and is reported as already sharing them, rather than counted as waste.
- Scanner coverage grows release to release. Copy must never enumerate it in prose — see `DESIGN.md` § Voice & Copy.
- Default cleanup moves targets to the native Recycle Bin/Trash.
- Permanent deletion exists as a destructive backend mode and requires exact `Nuke` confirmation.
- Backend canonicalizes paths, rejects symlinks and critical roots, enforces scan-root scope, and protects against arbitrary frontend paths.
- Targets are held in memory and become invalid when the application restarts.
- Current desktop window is resizable and undecorated, and the app is inset from its edges by a transparent gutter its shadow falls into. The visible app starts at 1080x800 and has an 800x600 minimum; the window itself carries the gutter on top, and drops it while maximized or fullscreen.
- Default appearance is light. Dark and system-follow are opt-in from Settings § Appearance.
- Cleanup completion may celebrate confirmed results with positive copy, reclaimed-byte emphasis, animation, and confetti. Active, failed, and cancelled states remain factual.

## Brand Commitments

- Product name: Uncached.
- Tagline: "Reclaim disk from build artifacts." Used in metadata, the About panel, and any header subtitle.
- Voice: spec-terse and developer-facing during operations. No metaphor, lifestyle framing, emotional reassurance, or exclamation marks near destructive actions. Confirmed success may use positive language and celebration.
- Product term for a detected disposable directory is **target**, not "finding" or "item". The scanned root is the **workspace** — it names the first step, the primary action (`Scan workspace`), and the back affordance. Keep one term per concept across UI, docs, and metadata.
- Preserve existing Uncached logo and icon assets in `public/brand`.
- Preserve desktop-first Tauri architecture.

## Evidence on Hand

- Product documentation: `README.md`, `docs/ARCHITECTURE.md`, `docs/SCANNERS.md`, `docs/CLEANERS.md`, `docs/IPC.md`.
- Existing logo and icon assets: `public/brand/`.
- No customer testimonials, benchmark claims, or external proof are established; future work must not fabricate them.

## Product Principles

- Make cleanup safe by default.
- State what will happen before it happens, in bytes and paths.
- Keep scan and cleanup operations responsive.
- Treat backend authorization as the source of truth.
- Reclaim space without disrupting developer workflow.
- Report, do not reassure: measurements and consequences instead of comfort.
- Never invent progress, sizes, or outcomes the backend has not reported.
- Celebrate only cleanup outcomes confirmed by the backend.
- Name the phase the backend is actually in, including the ones between the obvious steps.
- Offer a control only while its operation exists; never dress a dead control as status.
