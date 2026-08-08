# Candidate Discovery and Bounded Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make discovery candidate-directed and maintainable, and make Desktop size confirmed targets concurrently with bounded workers before Review opens.

**Architecture:** Split core scanner responsibilities into traversal, pruning, and provider modules without changing `traverse_workspace` or `Scanner` public signatures. Desktop keeps streaming `scan:target_found`, submits confirmed targets to a bounded sizing pool, and emits `scan:finished` only after traversal and all sizing jobs settle.

**Tech Stack:** Rust, `jwalk`, Tauri 2, React, TypeScript, Vitest/Jest project tests, Criterion benchmarks.

## Global Constraints

- Targets stream during the asynchronous scan.
- Review opens only after every target is settled.
- Every target has a reported byte size or an explicit sizing error.
- Discovery processes only directories and never enters confirmed artifacts.
- Provider context checks run only after basename match.
- There must not be one unbounded OS thread per candidate.
- Worker count derives from `available_parallelism().map(|n| n.get().clamp(1, 8)).unwrap_or(1)`.
- `ProviderSet::free()` remains NodeModules-only.
- `ProviderSet::all()` keeps a deterministic provider order.
- `size_pending == false` and `size_has_errors == false` remain cleanup claim requirements.
- Sizing is not cleanup security authority; identity, policy, symlink/reparse, and secure operation checks remain mandatory.
- Sizing errors remain visible and block cleanup; `refresh_target_size(target_id)` retries them.
- Cancellation is meaningful only during traversal; late sizing updates cannot mutate closed sessions.
- Preserve existing Desktop changes, including the blank line state in `src-tauri/src/commands/mod.rs`.

---

## File Structure

- Create: `uncached-core/src/scanner/mod.rs` — public scanner API, `Scanner`, `ProviderSet`
- Create: `uncached-core/src/scanner/traversal.rs` — WalkDir traversal and cancellation
- Create: `uncached-core/src/scanner/pruning.rs` — ignored-directory policy and terminal pruning
- Create: `uncached-core/src/scanner/providers/mod.rs` — built-in provider registry
- Create: `uncached-core/src/scanner/providers/node_modules.rs` — NodeModules provider
- Create: `uncached-core/src/scanner/providers/cargo_target.rs` — Cargo target provider
- Create: `uncached-core/src/scanner/providers/next.rs` — Next.js provider
- Create: `uncached-core/src/scanner/providers/turbo.rs` — Turbo provider
- Create: `uncached-core/src/scanner/providers/python_cache.rs` — Python cache provider
- Create: `uncached-core/src/scanner/providers/gradle.rs` — Gradle provider
- Modify: `uncached-core/src/lib.rs` — preserve scanner exports after module split
- Delete: `uncached-core/src/scanner.rs` — replace monolithic scanner module
- Modify: `uncached-core/tests/node_modules.rs` — provider and pruning behavior tests
- Modify: `uncached-core/tests/providers.rs` — provider registry tests
- Modify: `uncached-core/benches/pruning.rs` — candidate-directed traversal benchmark coverage
- Modify: `uncached-desktop/src-tauri/src/services/scan_service.rs` — bounded sizing pool and session settling
- Modify: `uncached-desktop/src-tauri/src/commands/scan.rs` — explicit retry/error event behavior
- Modify: `uncached-desktop/src-tauri/src/models/target.rs` — settled/error state serialization if required by current types
- Modify: `uncached-desktop/src-tauri/src/services/clean_service.rs` — preserve settled-size cleanup contract
- Modify: `uncached-desktop/src-tauri/src/commands/clean.rs` — preserve claim and cleanup lifecycle
- Modify: `uncached-desktop/src-tauri/src/services/scan_service.rs` tests — pool, settling, cancellation, retry
- Modify: `uncached-desktop/src-tauri/src/commands/scan.rs` tests — retry event/error behavior
- Modify: `uncached-desktop/src/hooks/useScanWorkspace.ts` — Review gating and pending/error state handling
- Modify: `uncached-desktop/src/components/findings/TargetCard.tsx` — explicit pending/error display and retry action contract
- Modify: `uncached-desktop/src/components/findings/FindingsSection.tsx` — settled target selection/count behavior
- Modify: `uncached-desktop/src/types/scan.ts` — event payload fields only if backend contract changes

---

### Task 1: Split Core Discovery Into Maintainable Modules

**Files:**
- Create: `uncached-core/src/scanner/mod.rs`
- Create: `uncached-core/src/scanner/traversal.rs`
- Create: `uncached-core/src/scanner/pruning.rs`
- Create: `uncached-core/src/scanner/providers/mod.rs`
- Create: `uncached-core/src/scanner/providers/node_modules.rs`
- Create: `uncached-core/src/scanner/providers/cargo_target.rs`
- Create: `uncached-core/src/scanner/providers/next.rs`
- Create: `uncached-core/src/scanner/providers/turbo.rs`
- Create: `uncached-core/src/scanner/providers/python_cache.rs`
- Create: `uncached-core/src/scanner/providers/gradle.rs`
- Modify: `uncached-core/src/lib.rs`
- Delete: `uncached-core/src/scanner.rs`

**Interfaces:**
- Consumes: existing `Scanner`, `ProviderSet`, `TraversalEntry`, `TraversalControl`, `TraversalOutcome`, and `traverse_workspace` behavior.
- Produces: unchanged public exports and signatures from `uncached_core::scanner`.

- [ ] **Step 1: Capture current public API and behavior**

Run from `uncached-core`:

```bash
cargo test
git grep -n "pub use scanner\|pub trait Scanner\|pub fn traverse_workspace"
```

Expected: current tests pass and public symbols are recorded before the module move.

- [ ] **Step 2: Create provider modules without changing behavior**

Move each provider struct and its `Scanner` implementation into its named module. Each module must expose its provider type with the existing name. Keep provider rules exact, including NodeModules nested/tooling rejection and the existing context checks.

`providers/mod.rs` must register providers in the same order:

```rust
pub(crate) mod cargo_target;
pub(crate) mod gradle;
pub(crate) mod node_modules;
pub(crate) mod next;
pub(crate) mod python_cache;
pub(crate) mod turbo;

pub use cargo_target::CargoTargetScanner;
pub use gradle::GradleScanner;
pub use node_modules::NodeModulesScanner;
pub use next::NextCacheScanner;
pub use python_cache::PyCacheScanner;
pub use turbo::TurboCacheScanner;
```

- [ ] **Step 3: Move `Scanner`, `ProviderSet`, and traversal data types to `scanner/mod.rs`**

Keep these signatures unchanged:

```rust
pub trait Scanner: Send + Sync {
    fn category(&self) -> Category;
    fn matches(&self, name: &str) -> bool;
    fn confirm_context(&self, path: &Path) -> bool;
}

pub fn traverse_workspace<F>(
    root: &Path,
    providers: &ProviderSet,
    cancelled: &AtomicBool,
    callback: F,
) -> CoreResult<TraversalOutcome>
where
    F: FnMut(&TraversalEntry) -> TraversalControl;
```

Declare `mod traversal;`, `mod pruning;`, and `mod providers;` from `scanner/mod.rs`, then re-export the same public symbols currently exported by `lib.rs`.

- [ ] **Step 4: Move traversal implementation to `traversal.rs`**

Keep traversal sequence explicit:

```text
symlink/non-directory rejection
  -> ignored-directory pruning
  -> basename match
  -> provider context validation
  -> file identity only for confirmed candidate
  -> callback
  -> terminal prune or continue
```

Do not call sizing, deletion, or provider-specific traversal from this module.

- [ ] **Step 5: Add pruning policy module**

Move `PrunedPaths` into `pruning.rs`. Add a single policy function used by `process_read_dir` for known unproductive directories. It must reject path components, not string prefixes, and must not include candidate names such as `node_modules`, `target`, `.next`, `.turbo`, `.gradle`, or Python cache names.

The policy must cover existing protected directories and the documented nonproductive VCS/editor directories that cannot produce configured candidates. Keep pruning terminal candidate paths separate from ignored-directory policy.

- [ ] **Step 6: Update `lib.rs` exports and remove monolithic file**

Keep `pub mod scanner;` in `lib.rs` and preserve all current scanner re-exports. Delete `scanner.rs` only after the module tree compiles.

- [ ] **Step 7: Run core tests and clippy**

```bash
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

Expected: no behavior regressions and no warnings.

- [ ] **Step 8: Commit**

```bash
git add src/scanner src/lib.rs
git rm src/scanner.rs
git commit -m "refactor(core): modularize candidate discovery"
```

---

### Task 2: Prove Candidate Accuracy and Traversal Performance

**Files:**
- Modify: `uncached-core/tests/node_modules.rs`
- Modify: `uncached-core/tests/providers.rs`
- Modify: `uncached-core/benches/pruning.rs`

**Interfaces:**
- Consumes: modular `traverse_workspace` and provider modules from Task 1.
- Produces: regression tests and benchmark evidence for candidate-directed discovery.

- [ ] **Step 1: Add failing traversal-observation tests**

Add a test-only callback fixture that records every callback path and asserts:

```rust
assert!(visited.iter().all(|path| fs::symlink_metadata(path).unwrap().is_dir()));
assert!(!visited.iter().any(|path| path.ends_with("package.bin")));
```

Add fixtures containing a confirmed `node_modules` with nested files and an ignored `.git` directory containing a fake candidate. Assert the confirmed artifact's children and ignored subtree are absent from visited paths, while a valid nested project outside those directories is found.

- [ ] **Step 2: Add provider false-positive tests**

For each configured provider, add one valid context and one same-basename invalid context. Assert only valid contexts become candidates. Preserve existing NodeModules tooling/nested tests.

- [ ] **Step 3: Add candidate-count benchmark fixture**

Extend `benches/pruning.rs` with a deterministic fixture containing many irrelevant directory levels, many files inside terminal artifacts, and a small number of valid targets. Benchmark traversal with callback-only discovery. Do not size targets in this benchmark.

- [ ] **Step 4: Run focused tests and benchmark compilation**

```bash
cargo test --test node_modules --test providers
cargo bench --bench pruning --features bench --no-run
```

Expected: all tests pass and Criterion benchmark target compiles.

- [ ] **Step 5: Commit**

```bash
git commit -m "test(core): verify candidate-directed discovery"
```

---

### Task 3: Implement Bounded Desktop Sizing Pool and Session Settling

**Files:**
- Modify: `uncached-desktop/src-tauri/src/services/scan_service.rs`
- Modify: `uncached-desktop/src-tauri/src/commands/scan.rs`

**Interfaces:**
- Consumes: `traverse_workspace`, `TargetSizeUpdate`, existing registry/session lifecycle.
- Produces: `scan:target_found`, `scan:target_sized`, and `scan:finished` with settled-size semantics.

- [ ] **Step 1: Add failing session-settling tests**

Add tests for these invariants before changing production code:

```rust
fn session_can_finish(walk_finished: bool, pending_sizes: usize) -> bool {
    walk_finished && pending_sizes == 0
}

assert!(!session_can_finish(true, 1));
assert!(session_can_finish(true, 0));
assert!(!session_can_finish(false, 0));
```

Also add a test proving a late sizing update for a removed target returns `None` and cannot recreate registry state.

- [ ] **Step 2: Define bounded sizing job state**

Use a bounded `sync_channel` and a fixed worker count:

```rust
let workers = std::thread::available_parallelism()
    .map(|count| count.get().clamp(1, 8))
    .unwrap_or(1);
```

Define an internal job containing `scan_id`, `target_id`, and `PathBuf`. Workers calculate `calculate_dir_size_report` outside registry locks. Keep channel ownership and worker joins inside a scan-local sizing controller so workers exit after the walk has submitted its jobs and the queue drains.

- [ ] **Step 3: Extend `ScanSession` with settling state**

Add `walk_finished` and `pending_sizes`. Increment `pending_sizes` before submitting each confirmed target. Decrement exactly once after success or error. Add a helper that removes/marks the session finished only when `walk_finished && pending_sizes == 0`.

Do not call `end_session` immediately after traversal anymore. Mark walk finished, then let the final sizing worker emit `scan:finished`.

- [ ] **Step 4: Replace one-thread-per-target launch**

Remove the `start_target_size` call from the traversal callback. Submit the target to the bounded sizing controller after registry insertion and `scan:target_found` emission. Preserve cancellation checks before submission.

- [ ] **Step 5: Settle updates and emit events**

On worker completion:

1. update target size and error flags if target/session still exists;
2. emit `scan:target_sized` with `sizePending=false`;
3. decrement pending count;
4. if walk finished and pending count is zero, emit exactly one `scan:finished`.

If sizing fails, keep target visible with `sizeHasErrors=true`; do not emit `scan:failed`.

- [ ] **Step 6: Preserve retry behavior**

Keep `refresh_target_size` as synchronous retry for one target. Set pending state before retry and emit `scan:target_sized` on success. On error, leave target visible with `sizePending=false` and `sizeHasErrors=true` so UI can retry.

- [ ] **Step 7: Add concurrency and lifecycle tests**

Cover:

- no more than the configured worker limit is active;
- target event arrives before size event;
- finished event waits for all jobs;
- worker completion before walk end does not finish session;
- sizing error settles target and blocks cleanup;
- cancellation removes targets and discards late updates;
- empty scan emits finished without sizing jobs.

- [ ] **Step 8: Run Desktop focused tests**

```bash
cargo test scan_service
cargo test commands::scan
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/services/scan_service.rs src-tauri/src/commands/scan.rs
git commit -m "feat(desktop): bound concurrent target sizing"
```

---

### Task 4: Align Cleanup and Frontend Review Gating

**Files:**
- Modify: `uncached-desktop/src-tauri/src/services/clean_service.rs`
- Modify: `uncached-desktop/src-tauri/src/commands/clean.rs`
- Modify: `uncached-desktop/src/hooks/useScanWorkspace.ts`
- Modify: `uncached-desktop/src/components/findings/TargetCard.tsx`
- Modify: `uncached-desktop/src/components/findings/FindingsSection.tsx`
- Modify: `uncached-desktop/src/types/scan.ts` only if event payload fields change

**Interfaces:**
- Consumes: settled sizing lifecycle from Task 3.
- Produces: Review only after settled targets; errored targets visible and blocked; cleanup remains identity-authorized.

- [ ] **Step 1: Add frontend tests for Review gating**

Add tests around the scan hook/state reducer proving:

```text
scan finished + target pending -> Review closed
scan finished + target sizing error -> Review visible, cleanup disabled
scan finished + all targets settled without errors -> Review visible, cleanup enabled
```

- [ ] **Step 2: Remove assumptions that `scan:finished` means sizing is complete**

Keep the frontend guard requiring target count and `!sizePending`, but make the backend settled event the authoritative transition. Do not show `0 B` as measured while pending. Keep explicit error copy and retry action.

- [ ] **Step 3: Preserve cleanup blocking rules**

Keep `claim_target_for_cleanup` rejecting pending and error targets. Do not add sizing to `CleanService` or use size as TOCTOU authority. Ensure cleanup failure releases claim and keeps target retryable.

- [ ] **Step 4: Verify target card and bulk cleanup states**

Ensure target cards show pending/error/settled states, retry sizing for errors, and disable individual/bulk cleanup for pending or error targets. Preserve terse product copy and exact target/path/byte reporting.

- [ ] **Step 5: Run frontend and Rust tests**

```bash
pnpm test
cargo test clean_service
cargo test commands::clean
```

Expected: pending/error targets remain visible, cleanup authorization stays enforced.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/clean_service.rs src-tauri/src/commands/clean.rs src/hooks src/components/findings src/types/scan.ts
git commit -m "feat(desktop): gate review and cleanup on settled sizes"
```

---

### Task 5: End-to-End Verification and Documentation

**Files:**
- Modify: `uncached-desktop/docs/SCANNERS.md` if provider module rules need documentation
- Modify: `uncached-desktop/docs/ARCHITECTURE.md` with settled sizing lifecycle
- Modify: `uncached-core/PERFORMANCE.md` with candidate-directed benchmark results

**Interfaces:**
- Consumes: completed core and Desktop implementation from Tasks 1-4.
- Produces: verified cross-repository state and documented performance contract.

- [ ] **Step 1: Run core verification**

```bash
cd uncached-core
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

- [ ] **Step 2: Run Desktop verification**

```bash
cd uncached-desktop/src-tauri
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo check
```

If `cargo check` is blocked by the existing local `.cargo/config.toml` path override, document the exact path failure separately; do not modify unrelated local config during this feature.

- [ ] **Step 3: Run frontend verification**

```bash
cd uncached-desktop
pnpm test
pnpm build
```

- [ ] **Step 4: Run performance benchmark**

```bash
cd uncached-core
cargo bench --bench pruning --features bench
```

Record directories examined, candidates confirmed, sizing work, worker count, and total settling time. Confirm terminal artifacts are not traversed.

- [ ] **Step 5: Update documentation**

Document that discovery is candidate-directed, provider modules are isolated, sizing is bounded/concurrent, Review waits for settled targets, and sizing errors block cleanup but remain visible.

- [ ] **Step 6: Inspect status and commit only intended files**

```bash
git status --short
git diff --stat
git diff --check
```

Preserve unrelated `Cargo.lock`, `.cargo/config.toml`, and pre-existing blank-line changes unless explicitly approved.

- [ ] **Step 7: Commit documentation and push repositories**

```bash
git add docs/ARCHITECTURE.md docs/SCANNERS.md
git commit -m "docs: document candidate discovery and settled sizing"
git push origin master
```

Push the corresponding core commits to `origin/main` separately after checking that only intended core files changed.
