# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Local developers maintaining project workspaces on their own machines.

## Product Purpose

Uncached finds disposable artifacts produced by software projects and helps developers reclaim disk space without manually hunting through folders. Success means developers can review detected artifacts and safely move selected items to the system Recycle Bin/Trash.

## Positioning

Safety-first cleanup for developer workspaces: Uncached detects known disposable artifacts, requires contextual confirmation, and permits cleanup only for targets registered during the current scan session. The frontend never authorizes arbitrary paths.

## Operating Context

Users choose or paste a workspace folder, run an asynchronous scan, review detected targets and their estimated sizes, select items, confirm cleanup, and move them to the native Recycle Bin/Trash. Scan progress and cleanup events update the interface while long operations run.

## Capabilities and Constraints

- Desktop-first Tauri 2 application with React/Vite frontend and Rust backend.
- Implemented scanners cover `node_modules`, Rust `target`, Python caches (`__pycache__`, `.pytest_cache`, `.mypy_cache`), and `.gradle`.
- Scanner categories for Next.js, .NET, Docker, and `.venv` exist in the model but are not currently registered.
- Default cleanup moves targets to the native Recycle Bin/Trash.
- Permanent deletion exists as a destructive backend mode and requires exact `Nuke` confirmation.
- Backend canonicalizes paths, rejects symlinks and critical roots, enforces scan-root scope, and protects against arbitrary frontend paths.
- Targets are held in memory and become invalid when the application restarts.
- Current desktop window is resizable, starts at 1080x800, and has an 800x600 minimum.

## Brand Commitments

- Product name: Uncached.
- Preserve existing Uncached logo and icon assets in `public/brand`.
- Preserve desktop-first Tauri architecture.

## Evidence on Hand

- Product documentation: `README.md`, `docs/ARCHITECTURE.md`, `docs/SCANNERS.md`, `docs/CLEANERS.md`, `docs/IPC.md`.
- Existing logo and icon assets: `public/brand/`.
- No customer testimonials, benchmark claims, or external proof are established; future work must not fabricate them.

## Product Principles

- Make cleanup safe by default.
- Show users what will happen before it happens.
- Keep scan and cleanup operations responsive.
- Treat backend authorization as the source of truth.
- Reclaim space without disrupting developer workflow.
