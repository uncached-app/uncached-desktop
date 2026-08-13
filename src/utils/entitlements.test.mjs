import test from "node:test";
import assert from "node:assert/strict";
import { isFreeTarget, summarizePlans } from "./entitlements.mjs";

test("reads the plan stamped by the native layer", () => {
  assert.equal(isFreeTarget({ plan: "free" }), true);
  assert.equal(isFreeTarget({ plan: "pro" }), false);
});

test("an absent plan is never treated as free", () => {
  assert.equal(isFreeTarget({}), false);
  assert.equal(isFreeTarget({ plan: "FREE" }), false);
});

test("summarizes free and pro reclaimable bytes", () => {
  assert.deepEqual(
    summarizePlans([
      { plan: "free", sizeBytes: 12 },
      { plan: "pro", sizeBytes: 80 },
      { plan: "pro", sizeBytes: 35 },
    ]),
    { freeBytes: 12, proBytes: 115 },
  );
});
