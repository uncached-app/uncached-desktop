import test from "node:test";
import assert from "node:assert/strict";
import { canOpenReview } from "../src/utils/scanReview.mjs";

const target = (overrides = {}) => ({
  sizePending: false,
  sizeHasErrors: false,
  ...overrides,
});

test("keeps Review closed when scan finished but target is pending", () => {
  assert.equal(canOpenReview(true, 1, [target({ sizePending: true })]), false);
});

test("opens Review for settled sizing error while cleanup stays unavailable", () => {
  assert.equal(canOpenReview(true, 1, [target({ sizeHasErrors: true })]), true);
});

test("opens Review and permits cleanup when every target is settled without errors", () => {
  assert.equal(canOpenReview(true, 2, [target(), target()]), true);
});
