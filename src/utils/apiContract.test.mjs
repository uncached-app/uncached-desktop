import test from "node:test";
import assert from "node:assert/strict";
import {
  canUseCleanupMode,
  isCurrentScanGeneration,
  isCurrentScanRequest,
  normalizeTargetFound,
  normalizeTargetSized,
  shouldIgnoreScanFailure,
  toUiError,
  unwrapV1,
  validateCapabilities,
  validateScanFailed,
  validateScanFinished,
} from "./apiContract.ts";

test("unwraps a successful v1 envelope", () => {
  assert.equal(unwrapV1({ apiVersion: "v1", platform: "windows", data: { value: 1 }, error: null }).value, 1);
});

test("rejects unknown API versions", () => {
  assert.throws(() => unwrapV1({ apiVersion: "v2", platform: "windows", data: {}, error: null }), /Unsupported API version/);
});

test("rejects envelopes with invalid data and error shape", () => {
  assert.throws(() => unwrapV1({ apiVersion: "v1", platform: "windows", data: {}, error: {} }), /exactly one/);
  assert.throws(() => unwrapV1({ apiVersion: "v1", platform: "windows", data: null, error: null }), /exactly one/);
  assert.throws(() => unwrapV1({ apiVersion: "v1", platform: "windows", data: {}, error: undefined }), /exactly one/);
  assert.throws(() => unwrapV1({ apiVersion: "v1", platform: "windows", data: undefined, error: null }), /exactly one/);
});

test("rejects unknown public error codes", () => {
  assert.throws(
    () => unwrapV1({
      apiVersion: "v1",
      platform: "windows",
      data: null,
      error: { code: "permission_denied", message: "Access denied", path: null, operation: null },
    }),
    /unknown error code/,
  );
});

test("requires nullable path and operation fields on public errors", () => {
  const base = { code: "io", message: "I/O error", path: null, operation: null };
  assert.throws(
    () => unwrapV1({ apiVersion: "v1", platform: "windows", data: null, error: { ...base, path: undefined } }),
    /invalid error shape/,
  );
  assert.throws(
    () => unwrapV1({ apiVersion: "v1", platform: "windows", data: null, error: { ...base, operation: undefined } }),
    /invalid error shape/,
  );
});

test("requires string public error messages", () => {
  assert.throws(
    () => unwrapV1({
      apiVersion: "v1",
      platform: "windows",
      data: null,
      error: { code: "io", message: 42, path: null, operation: null },
    }),
    /invalid error shape/,
  );
});

test("rejects malformed envelope metadata and payloads", () => {
  assert.throws(() => unwrapV1({ platform: "windows", data: {}, error: null }), /apiVersion/);
  assert.throws(() => unwrapV1({ apiVersion: "v1", platform: "ios", data: {}, error: null }), /platform/);
  assert.throws(() => unwrapV1({ apiVersion: "v1", platform: "windows", data: "payload", error: null }), /payload/);
  assert.throws(() => unwrapV1({ apiVersion: "v1", platform: "windows", data: {}, error: null, extra: true }), /shape/);
});

test("normalizes v1 target DTOs without losing backend identity", () => {
  const target = normalizeTargetFound({
    scanId: "scan-1",
    target: {
      id: "scan-1-target-1",
      path: "C:\\workspace\\node_modules",
      category: "NodeModules",
      plan: "free",
      sizeBytes: 0,
      sizePending: true,
      sizeHasErrors: false,
      formattedSize: "0 B",
      lastModified: null,
    },
  });

  assert.equal(target.target.id, "scan-1-target-1");
  assert.equal(target.target.plan, "free");
  assert.equal(target.target.name, "node_modules");
  assert.equal(target.target.formattedSize, "");
  assert.equal(target.target.sizePending, true);
  assert.equal(target.target.lastModified, null);
});

test("keeps the plan the native layer sent instead of deriving it", () => {
  const target = normalizeTargetFound({
    scanId: "scan-1",
    target: {
      id: "scan-1-target-1",
      path: "C:\\workspace\\node_modules",
      category: "NodeModules",
      plan: "pro",
      sizeBytes: 1,
      sizePending: false,
      sizeHasErrors: false,
      formattedSize: "1 B",
    },
  });

  assert.equal(target.target.plan, "pro");
});

test("rejects a target without a usable plan", () => {
  const baseTarget = {
    id: "scan-1-target-1",
    path: "C:\\workspace\\node_modules",
    category: "NodeModules",
    sizeBytes: 0,
    sizePending: false,
    sizeHasErrors: false,
    formattedSize: "0 B",
  };

  for (const plan of [undefined, null, "", "FREE", "trial", 1]) {
    assert.throws(
      () => normalizeTargetFound({ scanId: "scan-1", target: { ...baseTarget, plan } }),
      /target payload shape/,
    );
  }
});

test("rejects malformed target display fields", () => {
  const baseTarget = {
    id: "scan-1-target-1",
    path: "C:\\workspace\\node_modules",
    category: "NodeModules",
    plan: "free",
    sizeBytes: 0,
    sizePending: false,
    sizeHasErrors: false,
    formattedSize: "0 B",
  };

  assert.throws(
    () => normalizeTargetFound({ scanId: "scan-1", target: { ...baseTarget, name: "" } }),
    /target payload shape/,
  );
  assert.throws(
    () => normalizeTargetFound({ scanId: "scan-1", target: { ...baseTarget, name: 42 } }),
    /target payload shape/,
  );
  assert.throws(
    () => normalizeTargetFound({ scanId: "scan-1", target: { ...baseTarget, lastModified: 42 } }),
    /target payload shape/,
  );
});

test("rejects malformed finished payloads before UI state can consume them", () => {
  assert.throws(
    () => unwrapV1(
      {
        apiVersion: "v1",
        platform: "windows",
        data: { scanId: "scan-1", totalTargets: "1", totalBytesFound: 10, durationMs: 5 },
        error: null,
      },
      validateScanFinished,
    ),
    /finished payload/,
  );
});

test("validates correlated scan failures and nested sanitized errors", () => {
  const failure = validateScanFailed({
    scanId: "scan-2",
    error: { code: "target_identity_changed", message: "target identity changed", path: "target", operation: null },
  });
  assert.equal(failure.scanId, "scan-2");
  assert.equal(failure.error.code, "target_identity_changed");
  assert.throws(
    () => validateScanFailed({
      scanId: "scan-2",
      error: { code: "permission_denied", message: "Access denied", path: null, operation: null },
    }),
    /unknown error code/,
  );
  assert.throws(
    () => validateScanFailed({ scanId: "scan-2", error: { code: "io", message: "I/O error", path: null } }),
    /error shape/,
  );
});

test("rejects malformed capability payloads before action gating", () => {
  assert.throws(
    () => unwrapV1(
       { apiVersion: "v1", platform: "windows", data: { permanentCleanup: true, moveToTrash: "yes", secureIdentity: false }, error: null },
      validateCapabilities,
    ),
    /capabilities payload/,
  );
});

test("rejects malformed target identity payloads before normalization", () => {
  assert.throws(
    () => unwrapV1(
      {
        apiVersion: "v1",
        platform: "windows",
        data: { scanId: "scan-1", target: { id: "", path: "C:\\temp", category: "Cache", plan: "pro", sizeBytes: 1, sizePending: false, sizeHasErrors: false, formattedSize: "1 B" } },
        error: null,
      },
      normalizeTargetFound,
    ),
    /target identity/,
  );
});

test("ignores stale start scan rejection after newer pending scan generation", () => {
  assert.equal(isCurrentScanGeneration(2, 2, true), true);
  assert.equal(isCurrentScanGeneration(1, 2, true), false);
  assert.equal(isCurrentScanGeneration(2, 2, false), false);
});

test("ignores stale cancel scan rejection after ownership changes", () => {
  assert.equal(isCurrentScanRequest(2, 2, "scan-2", "scan-2"), true);
  assert.equal(isCurrentScanRequest(1, 2, "scan-1", "scan-2"), false);
  assert.equal(isCurrentScanRequest(2, 2, "scan-2", "scan-3"), false);
  assert.equal(isCurrentScanRequest(2, 2, "scan-2", null), false);
});

test("buffers failure correlated to pending start, but ignores stale or idle failures", () => {
  assert.equal(shouldIgnoreScanFailure("scan-1", null, true), false);
  assert.equal(shouldIgnoreScanFailure("scan-old", "scan-2", false), true);
  assert.equal(shouldIgnoreScanFailure("scan-idle", null, false), true);
});

test("normalizes settled target size without rendering measured zero as pending", () => {
  const update = normalizeTargetSized({
    scanId: "scan-1",
    targetId: "scan-1-target-1",
    sizeBytes: 0,
    sizePending: false,
    sizeHasErrors: true,
    formattedSize: "0 B",
  });

  assert.equal(update.targetId, "scan-1-target-1");
  assert.equal(update.formattedSize, "0 B");
  assert.equal(update.sizePending, false);
});

test("converts core errors into explicit UI errors", () => {
  assert.deepEqual(
    toUiError({ code: "io", message: "Access denied", path: null, operation: "scan" }),
    { code: "io", message: "Access denied" },
  );
});

test("gates cleanup actions from capability booleans", () => {
   assert.equal(canUseCleanupMode({ permanentCleanup: true, moveToTrash: false, secureIdentity: true }, "Permanent"), true);
   assert.equal(canUseCleanupMode({ permanentCleanup: false, moveToTrash: true, secureIdentity: false }, "Permanent"), false);
   assert.equal(canUseCleanupMode({ permanentCleanup: false, moveToTrash: true, secureIdentity: false }, "Trash"), true);
});
