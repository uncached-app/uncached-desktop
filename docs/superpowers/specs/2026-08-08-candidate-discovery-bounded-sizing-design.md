# Candidate Discovery and Bounded Sizing Design

## Goal

Make Desktop discovery precise and maintainable while showing every confirmed
target with a correct size before Review opens. Discovery must avoid traversing
irrelevant files and artifact contents. Sizing must run concurrently with a
bounded worker pool rather than one thread per target.

This design follows `PRODUCT.md`:

- targets stream during the asynchronous scan;
- targets are sized concurrently;
- Review opens only after every target is settled;
- every target has a reported byte size or an explicit sizing error;
- backend remains source of truth for cleanup authorization.

It also follows `PERFORMANCE.md`:

- candidate-directed traversal;
- cheap filters before metadata and context checks;
- terminal pruning;
- sizing only after candidate confirmation;
- bounded concurrency and no traversal into artifacts.

## Architecture

### Candidate-directed discovery

`traverse_workspace` remains discovery entry point. Discovery processes only
directories. Files are rejected before provider matching. For each directory:

1. reject symlink/reparse entries and non-directories;
2. prune known unproductive directories;
3. compare basename against provider candidate names;
4. run provider context validation only after basename match;
5. register confirmed candidate with filesystem identity;
6. prune confirmed terminal candidate;
7. continue traversal only for directories that can contain a candidate.

Discovery never calculates directory size and never enters a confirmed artifact.
Provider context checks remain provider-specific. Adding a provider must not
require editing traversal logic.

### Modular discovery package

Split scanner responsibilities into focused modules:

```text
uncached-core/src/scanner/
  mod.rs
  traversal.rs
  pruning.rs
  providers/
    mod.rs
    node_modules.rs
    cargo_target.rs
    next.rs
    turbo.rs
    python_cache.rs
    gradle.rs
```

`scanner/mod.rs` owns public discovery API, `Scanner`, and `ProviderSet`.
`traversal.rs` owns `WalkDir`, cancellation, callback dispatch, and ordering.
`pruning.rs` owns ignored-directory policy and terminal pruning. Each provider
module owns only category, basename matching, and contextual validation.

Keep provider interface small and stable:

```rust
pub trait Scanner: Send + Sync {
    fn category(&self) -> Category;
    fn matches(&self, name: &str) -> bool;
    fn confirm_context(&self, path: &Path) -> bool;
}
```

Providers must not perform traversal, sizing, deletion, UI event emission, or
session state mutation. Every new provider requires tests for positive match,
false-positive rejection, and terminal pruning.

`ProviderSet::free()` remains NodeModules-only. `ProviderSet::all()` keeps a
deterministic provider order.

## Bounded sizing

When discovery confirms a target, Desktop creates a target with
`size_pending = true`, stores it in the session registry, emits
`scan:target_found`, and submits a sizing job to a bounded pool.

The pool worker calculates `calculate_dir_size_report` outside the registry
lock. It then updates the target under a short lock and emits
`scan:target_sized`. The worker must discard its update when the session or
target no longer exists.

Worker count derives from
`available_parallelism().map(|n| n.get().clamp(1, 8)).unwrap_or(1)`.
There must not be one unbounded OS thread per candidate.

## Session lifecycle

Each scan session tracks:

- `walk_finished`;
- `targets_found`;
- `pending_sizes`;
- settled targets;
- targets with sizing errors;
- cancellation state.

`scan:finished` is emitted only after traversal completes and
`pending_sizes == 0`. A target is settled when `size_pending == false`, with
either a valid byte count or a sizing error.

Sizing errors are per-target states, not scan failures. The target remains
visible with `size_has_errors = true` and cleanup remains blocked. The user can
retry through `refresh_target_size(target_id)`. Review can open after all
targets settle, including errored targets, so the UI can show the complete
result and explicit errors.

Cancellation is meaningful only during traversal. Sizing jobs already started
may finish, but cannot mutate a removed/closed session or emit stale target
updates.

## Cleanup contract

`claim_target` and `claim_target_for_cleanup` continue requiring:

- `size_pending == false`;
- `size_has_errors == false`.

Sizing provides product information and cleanup eligibility, not security.
Cleanup must still revalidate workspace policy, target identity, symlink/reparse
state, and secure operation immediately before deletion or Trash move.

## Events and UI contract

- `scan:target_found`: target exists, `sizePending=true`.
- `scan:target_sized`: target has settled size or explicit error state.
- `scan:progress`: traversal progress only; total bytes are not final until all
  targets settle.
- `scan:finished`: traversal and sizing are settled; Review may open.
- `scan:failed`: traversal/session failure, not an individual sizing error.

The frontend must not display `0 B` as a measured value while `sizePending` is
true and must not invent totals. It may display a pending state until the
target settles.

## Testing

Core discovery tests:

- files are not passed to provider matching;
- confirmed artifacts are terminal and their contents are not visited;
- ignored directories are not traversed;
- provider positive matches and false positives;
- provider additions remain isolated from traversal implementation.

Desktop sizing/session tests:

- sizing uses bounded worker count rather than one thread per target;
- targets stream before sizing completes;
- `scan:finished` waits for traversal and every sizing job;
- sizing completed before traversal does not finish the session early;
- sizing errors remain visible, block cleanup, and support retry;
- cancellation discards late sizing updates;
- all settled targets allow Review and cleanup claims;
- cleanup still protects TOCTOU independently of measured size.

Performance tests should include a workspace with many irrelevant directories,
many files inside terminal artifacts, and a small number of confirmed targets.
Benchmark metrics must distinguish directories examined, candidates confirmed,
and sizing work performed.

## Non-goals

- Do not change cleanup security model or replace identity/handle validation.
- Do not make sizing the authority for safe deletion.
- Do not add provider-specific traversal implementations.
- Do not hide targets whose sizing failed.
- Do not report a scan as finished while any target remains pending.
