import test from "node:test";
import assert from "node:assert/strict";
import { getCleanupCopy, requiresPermanentConfirmation } from "../src/utils/cleanMode.mjs";

test("permanent cleanup requires exact Nuke confirmation", () => {
  assert.equal(requiresPermanentConfirmation("Trash", ""), false);
  assert.equal(requiresPermanentConfirmation("Permanent", "nuke"), true);
  assert.equal(requiresPermanentConfirmation("Permanent", "Nuke"), false);
});

test("completion copy distinguishes reversible and permanent cleanup", () => {
  assert.deepEqual(getCleanupCopy("Trash", 2), {
    result: "2 items moved to your system Recycle Bin/Trash.",
    recovery: "You can restore them from the Recycle Bin/Trash if needed.",
  });
  assert.deepEqual(getCleanupCopy("Permanent", 1), {
    result: "1 item permanently deleted.",
    recovery: "This action cannot be undone.",
  });
});
