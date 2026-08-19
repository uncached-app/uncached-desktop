import test from "node:test";
import assert from "node:assert/strict";
import { canOpenReview, getCleanupReadyTargets, shouldOpenReview, sortForListing } from "../src/utils/scanReview.mjs";

// `cleanable` is present on every target the contract lets through —
// `validateScanTarget` defaults it — so a fixture without it was modelling a
// shape that does not arrive, and quietly relied on the old filter tolerating
// its absence.
const target = (overrides = {}) => ({
  cleanable: true,
  sizePending: false,
  sizeHasErrors: false,
  ...overrides,
});

test("keeps Review closed when scan finished but target is pending", () => {
  assert.equal(canOpenReview(true, 1, [target({ sizePending: true })]), false);
});

test("keeps Review open through sizing retry transitions", () => {
  const errored = target({ sizeHasErrors: true });
  assert.equal(canOpenReview(true, 1, [errored]), true);
  assert.equal(canOpenReview(true, 1, [{ ...errored, sizePending: true, sizeHasErrors: false }]), false);
  assert.equal(canOpenReview(true, 1, [target()]), true);
  assert.equal(canOpenReview(true, 1, [target({ sizeHasErrors: true })]), true);
});

test("opens Review for settled sizing error while cleanup stays unavailable", () => {
  assert.equal(canOpenReview(true, 1, [target({ sizeHasErrors: true })]), true);
});

test("opens Review and permits cleanup when every target is settled without errors", () => {
  assert.equal(canOpenReview(true, 2, [target(), target()]), true);
});

test("allows bulk cleanup only for valid targets in mixed results", () => {
  const valid = target({ id: "valid" });
  const errored = target({ id: "errored", sizeHasErrors: true });
  assert.deepEqual(getCleanupReadyTargets([valid, errored]), [valid]);
});

test("does not reopen Review after navigating back to step 1", () => {
  assert.equal(shouldOpenReview(2, true, 1, [target()]), true);
  assert.equal(shouldOpenReview(1, true, 1, [target()]), false);
});

test("orders targets by confidence, least certain first", () => {
  const targets = [
    { id: "a", confidence: { level: "high" } },
    { id: "b", confidence: { level: "review" } },
    { id: "c", confidence: { level: "medium" } },
    { id: "d", confidence: { level: "high" } },
  ];

  assert.deepEqual(
    sortForListing(targets, true).map((target) => target.id),
    ["b", "c", "a", "d"],
  );
});

test("keeps arrival order within a level and does not mutate the input", () => {
  const targets = [
    { id: "first", confidence: { level: "high" } },
    { id: "second", confidence: { level: "high" } },
    { id: "third", confidence: { level: "high" } },
  ];

  assert.deepEqual(
    sortForListing(targets, true).map((target) => target.id),
    ["first", "second", "third"],
  );
  assert.deepEqual(targets.map((target) => target.id), ["first", "second", "third"]);
});

test("a target with no usable level surfaces instead of hiding", () => {
  const targets = [
    { id: "known", confidence: { level: "high" } },
    { id: "unknown" },
    { id: "garbled", confidence: { level: "certain" } },
  ];

  assert.deepEqual(
    sortForListing(targets, true).map((target) => target.id),
    ["unknown", "garbled", "known"],
  );
});

test("on free, targets the plan can clean come first", () => {
  const targets = [
    { id: "pro-review", plan: "pro", confidence: { level: "review" } },
    { id: "free-high", plan: "free", confidence: { level: "high" } },
    { id: "pro-medium", plan: "pro", confidence: { level: "medium" } },
    { id: "free-review", plan: "free", confidence: { level: "review" } },
  ];

  assert.deepEqual(
    sortForListing(targets, false).map((target) => target.id),
    ["free-review", "free-high", "pro-review", "pro-medium"],
  );
});

test("on pro, confidence alone decides the order", () => {
  const targets = [
    { id: "pro-review", plan: "pro", confidence: { level: "review" } },
    { id: "free-high", plan: "free", confidence: { level: "high" } },
    { id: "pro-medium", plan: "pro", confidence: { level: "medium" } },
  ];

  assert.deepEqual(
    sortForListing(targets, true).map((target) => target.id),
    ["pro-review", "pro-medium", "free-high"],
  );
});

/**
 * The three conditions, pinned here so the mirror is visible on this side too.
 *
 * The definition is `ScanTarget::cleanup_ready` in
 * `src-tauri/src/models/target.rs`, and it has a test of the same name. A
 * fourth condition added there has to be added here.
 */
test("cleanup-ready mirrors ScanTarget::cleanup_ready, condition for condition", () => {
  const ready = getCleanupReadyTargets([
    { id: "ready", cleanable: true, sizePending: false, sizeHasErrors: false },
    { id: "report-only", cleanable: false, sizePending: false, sizeHasErrors: false },
    { id: "measuring", cleanable: true, sizePending: true, sizeHasErrors: false },
    { id: "unreadable", cleanable: true, sizePending: false, sizeHasErrors: true },
  ]);

  assert.deepEqual(
    ready.map((target) => target.id),
    ["ready"],
    "a catalogue-only location, an unfinished measurement and a failed one are all refusals the backend already makes",
  );
});

/**
 * The contract fills this in — `validateScanTarget` defaults it to true — so a
 * target without the flag is not a case that occurs. If it ever did, hiding the
 * control is the safe direction: the backend decides, and an affordance it
 * would refuse is the one thing this function exists to prevent.
 */
test("a target with no cleanable flag at all is withheld rather than offered", () => {
  const ready = getCleanupReadyTargets([{ id: "malformed", sizePending: false, sizeHasErrors: false }]);
  assert.deepEqual(ready, []);
});

/**
 * The other reading of the list, and the reason it exists: confidence decided
 * the order outright, so the largest directory on the machine could be anywhere
 * in it — on the screen where reclaiming actually happens.
 */
test("ranked by size, the heaviest target leads whatever the core thinks of it", () => {
  const targets = [
    { id: "small-review", sizeBytes: 10, confidence: { level: "review" } },
    { id: "huge-high", sizeBytes: 9_000, confidence: { level: "high" } },
    { id: "medium-medium", sizeBytes: 500, confidence: { level: "medium" } },
  ];

  assert.deepEqual(
    sortForListing(targets, true, "size").map((target) => target.id),
    ["huge-high", "medium-medium", "small-review"],
  );
  assert.deepEqual(
    sortForListing(targets, true).map((target) => target.id),
    ["small-review", "medium-medium", "huge-high"],
    "and the default is still the product's opinion",
  );
});

test("two targets of one size fall back to which is least certain", () => {
  const targets = [
    { id: "sure", sizeBytes: 100, confidence: { level: "high" } },
    { id: "unsure", sizeBytes: 100, confidence: { level: "review" } },
  ];

  assert.deepEqual(
    sortForListing(targets, true, "size").map((target) => target.id),
    ["unsure", "sure"],
  );
});

/**
 * The plan outranks both orders. A list that opens on rows the user is not
 * allowed to act on reads as a paywall wearing a scan, and that stays true
 * however the rest is sorted.
 */
test("on free the plan still wins over the size order", () => {
  const targets = [
    { id: "pro-huge", plan: "pro", sizeBytes: 9_000, confidence: { level: "high" } },
    { id: "free-small", plan: "free", sizeBytes: 10, confidence: { level: "high" } },
  ];

  assert.deepEqual(
    sortForListing(targets, false, "size").map((target) => target.id),
    ["free-small", "pro-huge"],
  );
});

test("a target that cannot be removed is not offered as work", () => {
  // Xcode's archives and the simulator store are reported and never touched.
  // A row in a reclaim list with its control taken out reads as a feature that
  // stopped halfway — worst of all at a few kilobytes, where the honest total
  // it was there to protect is worth nothing.
  const targets = [
    { id: "keep", confidence: { level: "high" }, sizeBytes: 10 },
    { id: "drop", confidence: { level: "high" }, sizeBytes: 999, cleanable: false },
  ];
  assert.deepEqual(
    sortForListing(targets, true, "size").map((target) => target.id),
    ["keep"],
  );
});

test("a target whose owner is running is never offered for cleanup", () => {
  const base = {
    cleanable: true,
    sizePending: false,
    sizeHasErrors: false,
    sizeBytes: 10,
  };
  const ready = getCleanupReadyTargets([
    { ...base, id: "free" },
    { ...base, id: "held", blockedBy: "claude" },
  ]);

  assert.deepEqual(
    ready.map((target) => target.id),
    ["free"],
    "the backend refuses a blocked target, so nothing may select it",
  );
});
