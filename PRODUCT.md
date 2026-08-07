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
- Implemented scanners cover `node_modules`, Rust `target`, Python caches (`__pycache__`, `.pytest_cache`, `.mypy_cache`), `.gradle`, `.next`, and `.turbo`.
- All scanners except the Python cache scanner are gated by a Settings § Scanning toggle; the Python scanner always runs.
- Scanner categories for .NET, Docker, and `.venv` exist in the model but have no scanner implementation.
- Scanner coverage grows release to release. Copy must never enumerate it in prose — see `DESIGN.md` § Voice & Copy.
- Default cleanup moves targets to the native Recycle Bin/Trash.
- Permanent deletion exists as a destructive backend mode and requires exact `Nuke` confirmation.
- Backend canonicalizes paths, rejects symlinks and critical roots, enforces scan-root scope, and protects against arbitrary frontend paths.
- Targets are held in memory and become invalid when the application restarts.
- Current desktop window is resizable, starts at 1080x800, and has an 800x600 minimum.

## Brand Commitments

- Product name: Uncached.
- Tagline: "Reclaim disk from build artifacts." Used in metadata, the About panel, and any header subtitle.
- Voice: spec-terse and developer-facing. No metaphor, lifestyle framing, emotional reassurance, exclamation marks, or celebration — including in success and empty states.
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
- Name the phase the backend is actually in, including the ones between the obvious steps.
- Offer a control only while its operation exists; never dress a dead control as status.
