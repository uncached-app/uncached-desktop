<p align="center">
  <img src="public/brand/UNCACHED-LOGO-LIGHT-NOBG.svg" alt="Uncached Logo" width="360" />
</p>

<p align="center">
  <strong>A calmer, faster way to reclaim disk space from heavy project build artifacts.</strong>
</p>

<p align="center">
  <a href="https://uncached.app"><img src="https://img.shields.io/badge/Website-uncached.app-b9d98d?style=for-the-badge&logoColor=101311" alt="Website" /></a>
  <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-v2.0-24c8db?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2" /></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Rust-Backend-orange?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React 19" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" /></a>
</p>

---

## ⚡ Overview

**Uncached** is a lightweight, cross-platform desktop application designed to find and safely clear disposable build artifacts (`node_modules`, Cargo `target/`, Gradle caches, `.next`, `.venv`, etc.) that silently consume tens of gigabytes across your developer workspace.

Built with **Rust** for native filesystem scanning speed and **React + Tauri v2** for a cozy, minimal, zero-bloat user experience.

---

## ✨ Features

- 🚀 **Blazing Fast Scanning**: Powered by a multi-threaded Rust backend capable of traversing tens of thousands of directories in seconds.
- 🛡️ **Safety-First Deletion**: Strict path validation prevents accidental deletion of source code or arbitrary system files.
- ♻️ **Recycle Bin Integration**: Moves items safely to system Recycle Bin by default instead of permanent deletion.
- 🎨 **Cozy & Minimalist UI**: Crafted with a calm dark aesthetic, grain noise textures, Geist Mono typography, and micro-interactions.
- 🔒 **100% Private & Local**: Zero telemetry, zero analytics, zero cloud uploads. Your filesystem stays completely on your device.
- 🎛️ **Granular Controls**: Select all or choose specific targets, review real-time size updates, and track total space reclaimed.

---

## 📦 Supported Ecosystems & Targets

| Ecosystem | Target Directory | Description | Risk Level |
| :--- | :--- | :--- | :---: |
| **Node.js / Web** | `node_modules` | Package dependencies cache | 🟢 Safe |
| **Rust / Cargo** | `target/` | Compiled Rust binaries and intermediate build artifacts | 🟢 Safe |
| **Android / Java** | `.gradle/` | Gradle build cache and wrapper dependencies | 🟢 Safe |
| **Next.js** | `.next/` | Next.js build cache and static output | 🟢 Safe |
| **Turborepo** | `.turbo/` | Turborepo build cache | 🟢 Safe |
| **Python** | `.venv`, `venv` | Virtual environments | 🟢 Safe |

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your system:

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [Rust toolchain](https://www.rust-lang.org/tools/install)
- [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system

### Installation & Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/natanvianasp/uncached.git
   cd uncached
   ```

2. **Install frontend dependencies**:
   ```bash
   pnpm install
   ```

3. **Start the application in development mode**:
   ```bash
   pnpm tauri dev
   ```

---

## 🧪 Verification & Testing

Run verification commands across frontend and backend before submitting contributions:

### Frontend Typecheck & Build
```bash
# Verify TypeScript compilation
pnpm exec tsc --noEmit

# Production web bundle build
pnpm build
```

### Backend Rust Tests & Formatting
```bash
cd src-tauri

# Format code
cargo fmt --check

# Run test suite
cargo test
```

---

## 🏗️ Architecture

```
uncached/
├── src/                          # React Frontend Application
│   ├── components/               # Modular Presentational UI Components
│   │   ├── workspace/            # Step 1: Workspace Selection Form
│   │   ├── scan/                 # Step 2: Scanning Progress View
│   │   ├── findings/             # Step 3: Review & Selection Grid
│   │   ├── completion/           # Step 4: Cleanup Summary & Victory View
│   │   ├── layout/               # Titlebar, Header, & Footer
│   │   └── settings/             # Settings Modal & Preferences
│   ├── hooks/                    # Custom React Hooks (useScanWorkspace, useSettings, useTheme)
│   ├── types/                    # Strongly-typed IPC Event Payloads & Models
│   └── utils/                    # Utility Functions (Byte Formatting, etc.)
│
└── src-tauri/                    # Native Rust Application
    ├── src/
    │   ├── scanner/              # Multi-threaded Workspace Scanner
    │   ├── cleaner/              # System Recycle Bin / Trash Manager
    │   ├── commands/             # Tauri IPC Command Handlers
    │   ├── models/               # Domain Models & IPC Types
    │   └── services/             # Application Services & State
    └── tauri.conf.json           # Tauri v2 App Configuration
```

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<p align="center">
  Crafted with care by <a href="https://github.com/natanvianasp">Natan Viana</a> · <a href="https://uncached.app">uncached.app</a>
</p>
