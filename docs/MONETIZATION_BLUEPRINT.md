# Uncached Pro: Monetization & Security Architecture Blueprint

This document outlines the future product strategy, technical security architecture, feature differentiation, and implementation roadmap for monetizing **Uncached**.

**Current state:** the free tier is a public download and Pro is sold through Paddle at $4.99/year or $14.99 once. Licence issuing and offline activation are implemented. The Pro feature set below ships progressively — a capability listed here is not necessarily shipped.

---

## 🎯 Executive Summary & Business Strategy

- **App Name**: Uncached
- **Business Model**: Hybrid Freemium / Paywall
- **Target Audience**: Software Engineers, Web Developers, Mobile Developers, & DevOps Engineers
- **Merchant of Record (MoR)**: [Paddle](https://www.paddle.com/)
  - *Handles global sales tax / VAT, invoicing, multi-currency payments, and license key generation automatically.*

### Pricing Tiers

1. **Free / Starter ($0)**
   - Core manual scanning and basic cleanup (`node_modules`, Cargo `target/`, `.gradle/`).
2. **Pro Annual Subscription ($4.99 / year)**
   - Full access to all Pro features, renewed yearly. A new licence key is emailed on every renewal.
3. **Pro Lifetime License ($14.99 one-time)**
   - Permanent license key for all Pro features, with no expiry.

---

## 📊 Feature Matrix (Free vs. Pro)

| Feature | Free Tier ($0) | Pro Tier ($4.99/yr or $14.99) |
| :--- | :---: | :---: |
| **Standard Target Scans** (`node_modules`, `target/`, `.gradle/`) | ✅ | ✅ |
| **Manual One-Click Cleanup** | ✅ | ✅ |
| **Recycle Bin / Trash Integration** | ✅ | ✅ |
| **Docker & Container Cleaner** (Dangling images, build cache, volumes) | ❌ | ✅ |
| **Deep IDE & Build Caches** (Xcode `DerivedData`, Android Studio, Next.js, Turbo, Pytest) | ❌ | ✅ |
| **Background Auto-Purge Daemon** (Scheduled background cleanup) | ❌ | ✅ |
| **Multi-Drive Parallel Scanner** (External NVMe, SSDs, NAS drives) | ❌ | ✅ |
| **Disk Reclaim Analytics** (Historical space graphs & breakdown per ecosystem) | ❌ | ✅ |

---

## 🛡️ Architecture & Anti-Crack Security Blueprint

To prevent unauthorized cracking, **all feature gating and license validation logic is executed strictly inside compiled Rust native code (`src-tauri`)**, never inside JavaScript.

```
                       +-----------------------------------+
                       |         Paddle Checkout           |
                       +-----------------+-----------------+
                                         |
                                         v  (Generates License Key)
                       +-----------------+-----------------+
                       |    Customer License Server (MoR)  |
                       +-----------------+-----------------+
                                         |
                       (API Validation / Cryptographic Token)
                                         v
+-----------------------------------------------------------------------------------+
|  UNCACHED DESKTOP APP                                                             |
|                                                                                   |
|  [ Frontend: React / TS ]                                                         |
|         │  (Triggers license key activation via IPC)                              |
|         ▼                                                                         |
|  [ Backend: Tauri / Rust Core ]                                                   |
|    ├── Hardware ID Generator (HWID fingerprint: CPU + Motherboard)               |
|    ├── Cryptographic Signature Validator (Ed25519 Public Key)                     |
|    ├── Encrypted Local Storage (AES-GCM encrypted license state)                  |
|    └── Pro Feature Enforcer (Docker, Auto-Purge, Deep Cleaners in Rust)          |
+-----------------------------------------------------------------------------------+
```

### Security Layers

1. **Rust-Enforced Gating**: JavaScript only receives read-only IPC status flags (`is_pro: bool`). Attempting to modify JS frontend code will not bypass Rust native execution blocks.
2. **Ed25519 Cryptographic Signature Check**: License tokens are signed server-side with a Private Key. The embedded Rust Public Key mathematically verifies authenticity, rendering keygens impossible.
3. **Hardware Binding (HWID)**: Licenses are bound to machine hardware fingerprints (CPU serial + motherboard ID), preventing key sharing across public forums.
4. **Binary Stripping & LTO Protection**:
   ```toml
   [profile.release]
   strip = true        # Removes all debug symbols
   opt-level = "z"     # Binary optimization
   lto = true          # Link-Time Optimization (obfuscates control flow)
   panic = "abort"
   ```
5. **Periodic Online Heartbeat**: Rust backend verifies active subscription status against the Paddle API when connected to the internet, revoking canceled/refunded licenses automatically.

---

## 🗺️ Implementation Roadmap

### Phase 1: Merchant & Store Setup
- [ ] Register Paddle merchant account (approved).
- [ ] Create **Uncached Pro** product with 2 prices:
  - Price 1: Annual subscription ($4.99/year)
  - Price 2: Lifetime License ($14.99 one-time)
- [ ] Point a Paddle notification destination at `POST /api/license` and subscribe it to `transaction.completed`.

### Phase 2: Rust Licensing Engine (`src-tauri/src/licensing/`)
- [ ] Implement HWID fingerprint generator.
- [ ] Implement Ed25519 signature validator & encrypted local license store.
- [ ] Expose Tauri IPC commands:
  - `activate_license(key: String) -> Result<LicenseStatus, String>`
  - `get_license_status() -> Result<LicenseStatus, String>`
  - `deactivate_license() -> Result<(), String>`

### Phase 3: Pro Feature Engines (Rust)
- [ ] Implement Docker Cleaner module (`docker system prune` / Docker API engine).
- [ ] Implement Xcode `DerivedData` & Android Studio deep cleaners.
- [ ] Implement background daemon scheduler for automated cleanups.

### Phase 4: Frontend UI Integration (React)
- [ ] Build "Upgrade to Pro" modal with pricing cards ($4.99/yr vs $14.99 lifetime).
- [ ] Add License Key input form with instant validation feedback.
- [ ] Add Pro badges on advanced settings options.

---

<p align="center">
  <em>Document created for <strong>Uncached</strong> engineering strategy.</em>
</p>
