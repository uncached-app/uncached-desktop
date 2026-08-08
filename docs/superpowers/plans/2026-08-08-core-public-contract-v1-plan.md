# Core Public Contract v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned Core DTOs and migrate Desktop IPC scan/cleanup events to a stable `v1` envelope with platform capabilities and safe public errors.

**Architecture:** Add independent Serde transport DTOs under `uncached_core::contract::v1`; keep current domain models and CLI API intact during migration. Desktop converts internal models into v1 envelopes at command/event boundaries and frontend rejects unknown versions before applying data.

**Tech Stack:** Rust, Serde, Tauri 2 events/commands, React, TypeScript, existing frontend test/build tooling.

## Global Constraints

- Use additive envelope with `apiVersion: "v1"`.
- New v1 DTOs are separate transport types, not aliases of internal domain models.
- This iteration covers `uncached-core` public Rust/Serde DTOs and Desktop Tauri commands/events.
- CLI remains on its current API during this migration.
- `CoreErrorCode` and `CoreErrorInfo` remain the public error contract.
- `FileIdentity` is never exposed to the frontend.
- `code` remains stable snake_case.
- Native error details stay in internal logs.
- Unknown codes or versions produce explicit frontend errors rather than silent fallback.
- New fields are optional; existing v1 fields never change meaning or disappear.
- Capabilities describe operation availability, not guaranteed success for every target.
- Do not replace backend authorization with capability checks.
- Do not change cleanup security behavior.

---

## File Structure

- Create: `uncached-core/src/contract/mod.rs` — contract module exports
- Create: `uncached-core/src/contract/v1.rs` — v1 DTOs, envelope, platform, conversions
- Modify: `uncached-core/src/lib.rs` — export contract and capability query
- Modify: `uncached-core/src/secure_cleanup.rs` — expose platform/capability query without exposing backend targets
- Create: `uncached-core/tests/contract_v1.rs` — exact JSON and round-trip contract tests
- Modify: `uncached-desktop/src-tauri/src/services/scan_service.rs` — convert scan payloads to v1 event DTOs
- Modify: `uncached-desktop/src-tauri/src/commands/scan.rs` — v1 retry response/error envelope
- Modify: `uncached-desktop/src-tauri/src/commands/clean.rs` — v1 cleanup event/error envelope
- Modify: `uncached-desktop/src-tauri/src/commands/mod.rs` — capability command registration if required
- Modify: `uncached-desktop/src-tauri/src/models/target.rs` — conversion into v1 target DTO
- Modify: `uncached-desktop/src/types/scan.ts` — v1 envelope and payload types
- Create: `uncached-desktop/src/utils/apiContract.ts` — version/platform validation and unwrap helpers
- Modify: `uncached-desktop/src/hooks/useScanWorkspace.ts` — reject unknown envelopes and consume v1 data
- Modify: `uncached-desktop/src/components/settings/SettingsPanel.tsx` or capability consumer — gate actions from capabilities
- Create: `uncached-desktop/src/utils/apiContract.test.mjs` — frontend contract tests
- Modify: `uncached-core/PERFORMANCE.md` only if contract work changes measured behavior; otherwise no performance doc change

---

### Task 1: Add Core Contract v1 DTOs and Platform Capabilities

**Files:**
- Create: `uncached-core/src/contract/mod.rs`
- Create: `uncached-core/src/contract/v1.rs`
- Modify: `uncached-core/src/lib.rs`
- Modify: `uncached-core/src/secure_cleanup.rs`
- Create: `uncached-core/tests/contract_v1.rs`

**Interfaces:**
- Produces `uncached_core::contract::v1::{ApiEnvelope, CleanupCapabilities, CleanupResultDto, Platform, ScanTargetDto, API_VERSION}`.
- Produces `uncached_core::cleanup_capabilities() -> CleanupCapabilities`.
- Keeps existing `ScanTarget`, `ScanReport`, `CleanReport`, and CLI APIs unchanged.

- [ ] **Step 1: Write failing JSON contract tests**

Create `uncached-core/tests/contract_v1.rs` with tests asserting exact camelCase JSON:

```rust
#[test]
fn scan_target_envelope_has_stable_v1_shape() {
    let value = serde_json::to_value(ApiEnvelope::success(
        Platform::Windows,
        ScanTargetDto {
            path: "C:\\workspace\\node_modules".into(),
            category: Category::NodeModules,
            size_bytes: 123,
            size_pending: false,
            size_has_errors: false,
        },
    )).unwrap();
    assert_eq!(value["apiVersion"], "v1");
    assert_eq!(value["platform"], "windows");
    assert_eq!(value["data"]["sizeBytes"], 123);
    assert!(value["error"].is_null());
}
```

Also test error envelopes have `data: null`, stable snake_case code, and no native `std::io::Error` detail.

- [ ] **Step 2: Run tests to verify RED**

Run from `uncached-core`:

```bash
cargo test --test contract_v1
```

Expected: compilation failure because `contract::v1` and DTO constructors do not exist yet.

- [ ] **Step 3: Implement platform and envelope types**

Implement Serde types with exact behavior:

```rust
pub const API_VERSION: &str = "v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform { Windows, Linux, Macos, Android, Unsupported }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiEnvelope<T> {
    pub api_version: String,
    pub platform: Platform,
    pub data: Option<T>,
    pub error: Option<CoreErrorInfo>,
}
```

Provide constructors that enforce exactly one of `data` or `error`:

```rust
impl<T> ApiEnvelope<T> {
    pub fn success(platform: Platform, data: T) -> Self;
    pub fn failure(platform: Platform, error: CoreErrorInfo) -> Self;
}
```

- [ ] **Step 4: Implement transport DTO conversions**

Define `ScanTargetDto`, `TargetFoundDto`, `TargetSizedDto`, `ScanFinishedDto`, and `CleanupResultDto` with Serde derives and explicit field names. Use `ScanTargetDto` inside `TargetFoundDto`; use `TargetSizedDto` for incremental updates and `ScanFinishedDto` for settled totals. Convert category through existing `Category`; never include `FileIdentity`.

- [ ] **Step 5: Expose platform capabilities**

Make the existing backend capability calculation available through a public function without exposing `SecureTarget` or backend internals:

```rust
pub fn cleanup_capabilities() -> contract::v1::CleanupCapabilities;
```

Map permanent cleanup, Trash, and secure identity based on compile-time backend support. Unsupported backends return all false.

- [ ] **Step 6: Run GREEN tests**

```bash
cargo test --test contract_v1
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

Expected: all existing and contract tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/contract src/lib.rs src/secure_cleanup.rs tests/contract_v1.rs
git commit -m "feat(core): add versioned public contract v1"
```

---

### Task 2: Add Core Error and Capability Contract Coverage

**Files:**
- Modify: `uncached-core/tests/contract_v1.rs`
- Modify: `uncached-core/src/error.rs` only if conversion helper is required

**Interfaces:**
- Consumes: Task 1 `ApiEnvelope::failure`, `CoreErrorInfo`, `cleanup_capabilities`.
- Produces: regression coverage for every public error code and platform capability matrix.

- [ ] **Step 1: Add failing exhaustive contract cases**

Add table-driven tests covering every `CoreErrorCode`, asserting:

```rust
assert!(serde_json::to_value(info.code).unwrap().is_string());
assert!(!json.to_string().contains("private-native-detail"));
```

Add capability tests for the current target and unsupported backend configuration. Tests must assert operation keys, not human-readable messages.

- [ ] **Step 2: Run focused tests**

```bash
cargo test --test contract_v1
```

Expected: tests pass against existing `CoreErrorInfo`; any missing DTO field or capability mapping fails at compile/assertion level.

- [ ] **Step 3: Commit**

```bash
git add tests/contract_v1.rs src/error.rs
git commit -m "test(core): lock v1 errors and capabilities"
```

---

### Task 3: Migrate Desktop Rust IPC Events to v1

**Files:**
- Modify: `uncached-desktop/src-tauri/src/services/scan_service.rs`
- Modify: `uncached-desktop/src-tauri/src/commands/scan.rs`
- Modify: `uncached-desktop/src-tauri/src/commands/clean.rs`
- Modify: `uncached-desktop/src-tauri/src/models/target.rs`
- Modify: `uncached-desktop/src-tauri/src/commands/mod.rs`

**Interfaces:**
- Consumes: Core v1 DTOs and `cleanup_capabilities()` from Tasks 1-2.
- Produces: all listed scan/cleanup events with `{ apiVersion, platform, data|error }`.

- [ ] **Step 1: Write failing Rust event serialization tests**

Add tests for `scan:target_found`, `scan:target_sized`, `scan:finished`, `scan:failed`, `clean:started`, `clean:finished`, and `clean:failed`. Assert `apiVersion == "v1"`, platform field, camelCase data, and `data == null` for errors.

- [ ] **Step 2: Run focused tests to verify RED**

```bash
cargo test commands::clean
cargo test commands::scan
cargo test services::scan_service
```

Expected: new assertions fail because current events are unwrapped JSON.

- [ ] **Step 3: Add Desktop conversion helpers**

Create small helpers at the event boundary:

```rust
fn platform() -> contract::v1::Platform;
fn target_found_event(scan_id: &str, target: &RegisteredTarget) -> ApiEnvelope<TargetFoundDto>;
fn target_sized_event(update: &TargetSizeUpdate) -> ApiEnvelope<TargetSizedDto>;
fn scan_finished_event(scan_id: &str, total_targets: u64, total_bytes: u64, duration_ms: u128)
    -> ApiEnvelope<ScanFinishedDto>;
fn error_event(error: &NukeError) -> ApiEnvelope<serde_json::Value>;
```

Keep internal `RegisteredTarget`, `TargetSizeUpdate`, and cleanup models unchanged where possible. Conversion helpers must not expose identity or native error sources.

- [ ] **Step 4: Wrap scan and cleanup events**

Replace direct `serde_json::json!` payloads at event emission sites with v1 envelope serialization. Preserve event names and lifecycle ordering. `scan:finished` must continue reporting settled totals from bounded sizing.

- [ ] **Step 5: Add capabilities command**

Expose a Tauri command returning `ApiEnvelope<CleanupCapabilities>` and register it in the command handler. Do not use it as a replacement for backend claim validation.

- [ ] **Step 6: Run GREEN Rust tests and checks**

```bash
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo check
```

Expected: all 77+ Desktop tests pass with normal local core patch configuration.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(desktop): wrap IPC events in contract v1"
```

---

### Task 4: Validate v1 in Frontend and Gate Capabilities

**Files:**
- Modify: `uncached-desktop/src/types/scan.ts`
- Create: `uncached-desktop/src/utils/apiContract.ts`
- Create: `uncached-desktop/src/utils/apiContract.test.mjs`
- Modify: `uncached-desktop/src/hooks/useScanWorkspace.ts`
- Modify: capability-consuming UI component

**Interfaces:**
- Consumes: Desktop v1 envelopes from Task 3.
- Produces: validated typed payloads and explicit unknown-version errors.

- [ ] **Step 1: Write failing frontend contract tests**

Add tests for:

```js
assert.equal(unwrapV1({ apiVersion: "v1", data: { value: 1 }, error: null }).value, 1);
assert.throws(() => unwrapV1({ apiVersion: "v2", data: {}, error: null }));
assert.throws(() => unwrapV1({ apiVersion: "v1", data: {}, error: {} }));
```

Also test error envelope conversion to explicit UI error and capability booleans gating actions.

- [ ] **Step 2: Run tests to verify RED**

```bash
pnpm test -- apiContract
```

Expected: module/function not found or assertions fail before implementation.

- [ ] **Step 3: Implement typed envelope validation**

Define TypeScript types:

```ts
export type ApiEnvelope<T> = {
  apiVersion: "v1" | string;
  platform: Platform;
  data: T | null;
  error: CoreErrorInfo | null;
};

export function unwrapV1<T>(envelope: ApiEnvelope<T>): T;
```

Reject unknown versions and envelopes with both/neither `data` and `error`. Never treat pending size `0` as measured bytes.

- [ ] **Step 4: Migrate scan hook event handlers**

Unwrap v1 before applying target, size, finished, failed, or cancellation payloads. Preserve existing pending/error/retry/Review behavior. Set explicit error state on unknown version.

- [ ] **Step 5: Add capability consumption**

Load capabilities once per app/session and disable unsupported actions in UI. Keep backend cleanup claim as final authority.

- [ ] **Step 6: Run GREEN frontend checks**

```bash
pnpm test
pnpm build
```

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(desktop): validate v1 IPC contract in frontend"
```

---

### Task 5: End-to-End Contract Verification and Documentation

**Files:**
- Modify: `uncached-desktop/docs/IPC.md`
- Modify: `uncached-desktop/docs/ARCHITECTURE.md`
- Create: `uncached-core/CONTRACT_V1.md` — Core-side contract reference

**Interfaces:**
- Consumes: completed Core and Desktop v1 implementation.
- Produces: documented contract and verified cross-repository compatibility.

- [ ] **Step 1: Verify Core**

```bash
cd uncached-core
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

- [ ] **Step 2: Verify Desktop**

```bash
cd uncached-desktop/src-tauri
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo check
```

- [ ] **Step 3: Verify frontend**

```bash
cd uncached-desktop
pnpm test
pnpm build
```

- [ ] **Step 4: Verify exact JSON fixtures**

Run contract tests and inspect serialized fixtures for:

- `apiVersion: "v1"`;
- platform values;
- camelCase fields;
- one of `data`/`error` present;
- no FileIdentity/native error detail;
- stable snake_case error codes.

- [ ] **Step 5: Document migration policy**

Document event names, envelope shape, DTO fields, error handling, capabilities semantics, unknown-version behavior, and v2 compatibility rule. Keep CLI explicitly listed as current-shape consumer until migrated.

- [ ] **Step 6: Inspect and commit docs**

```bash
git status --short
git diff --check
git add docs/IPC.md docs/ARCHITECTURE.md
git commit -m "docs: document core public contract v1"
```

From `uncached-core`, commit its reference separately:

```bash
git status --short
git diff --check
git add CONTRACT_V1.md
git commit -m "docs(core): document public contract v1"
```

- [ ] **Step 7: Push only intended repositories**

```bash
cd uncached-core && git push origin main
cd ../uncached-desktop && git push origin master
```

Preserve unrelated local files and verify both branches are synchronized after push.
