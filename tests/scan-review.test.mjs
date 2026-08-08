import test from "node:test";
import assert from "node:assert/strict";
import { canOpenReview, getCleanupReadyTargets, shouldOpenReview } from "../src/utils/scanReview.mjs";

const target = (overrides = {}) => ({
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
