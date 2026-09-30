<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/logo-on-dark.svg" />
    <img src="docs/brand/logo-on-light.svg" alt="Uncached" width="340" />
  </picture>
</p>

<p align="center"><strong>Reclaim disk from build artifacts.</strong></p>

<p align="center">
  <a href="https://uncached.app"><img src="https://img.shields.io/badge/uncached.app-f5c518?style=flat-square&labelColor=14140f" alt="uncached.app" /></a>
  <a href="https://uncached.app/download"><img src="https://img.shields.io/badge/macOS%20%C2%B7%20Linux-download-f5c518?style=flat-square&labelColor=14140f" alt="Download for macOS and Linux" /></a>
</p>

Uncached is the desktop app that finds the dependency, build and cache folders
your toolchains can rebuild, tells you which projects hold work that exists
nowhere else, and moves what you pick to the Trash.

This repository is the app: a Tauri v2 shell with a React 19 interface and a
Rust backend. Scanning, cleanup and dependency analysis live in
[`uncached-core`](https://github.com/uncached-app/uncached-core).

## What it does

**Free**

- Finds every rebuildable folder in your projects (`node_modules`, `target`,
  `.next`, `Pods`, `DerivedData`, `__pycache__`, `.gradle` and dozens more),
  each confirmed by the project file beside it.
- Gives each project a verdict from its git state. Uncommitted files, unpushed
  commits and stashes mark it Protect.
- Checks every target again at the moment it is removed, and moves it to the
  Trash by default.
- Flags secrets Git would publish: env files, private keys, credential files and
  registry tokens that are committed or not ignored.
- Reports unused dependencies, the size of `.git` and when `git gc` would shrink
  it, and how much space unused toolchain versions take.
- Shows free and reclaimable space in the menu bar.

**Pro** ($4.99 a year or $14.99 once)

- Scheduled maintenance, also when the disk runs low, with projects you keep out
  of it.
- Machine-wide caches: package managers, AI tools, editors.
- Every unused Node, Rust, Python and Java version, with its uninstall command.
- Up to 12 workspace folders, every duplicate dependency, reclaim history and
  insights, an optional weekly summary, and six Dock icons.

Everything runs locally. There is no account and no telemetry; the only network
requests are the update check and a `git fetch` when you ask for one.

## Platforms

- macOS 10.15 or later, Apple Silicon and Intel, signed and notarised.
- Linux, as an AppImage.
- Windows is planned, through the Microsoft Store.

Builds are published at [uncached.app/download](https://uncached.app/download),
and the app updates itself from the same place.

## Development

Requirements: Node.js 22, pnpm, a Rust toolchain, the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your
system, and a checkout of `uncached-core` next to this one.

```
uncached-app/
├── uncached-core/      # patched in by src-tauri/.cargo/config.toml
└── uncached-desktop/   # this repository
```

```bash
pnpm install
pnpm dev          # the app, Free
pnpm dev:pro      # the app with Pro unlocked, debug builds only
```

Checks, run before every commit:

```bash
pnpm test                          # interface and i18n tests
pnpm exec tsc --noEmit             # types
(cd src-tauri && cargo test)       # backend tests
(cd src-tauri && cargo fmt --check)
bash scripts/check-platforms.sh    # compiles and lints the non-macOS code paths
```

Releases are tagged `v<version>` and built by CI; the checklist is in
[`docs/RELEASING.md`](docs/RELEASING.md).

## Layout

```
src/                  React interface
  components/         screens and shared UI
  modules/            Dependencies, Maintenance, Insights
  hooks/              state and backend calls
  i18n/locales/       en, pt-BR, es, de, ja, ar
src-tauri/src/        Rust backend
  commands/           IPC commands
  workspace/          verdicts, git, secrets, toolchains, maintenance, schedule
  scheduler.rs        unattended maintenance and the weekly summary
  tray.rs             menu bar
tests/                node --test suites
scripts/              icons, release and platform checks
```

## License

Proprietary. Use of the app is governed by the
[EULA](https://uncached.app/eula).
