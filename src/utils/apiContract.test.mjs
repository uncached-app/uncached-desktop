import test from "node:test";
import assert from "node:assert/strict";
import {
  canUseCleanupMode,
  isCurrentScanGeneration,
  isCurrentScanRequest,
  normalizeTargetFound,
  normalizeTargetSized,
  toUiError,
  unwrapV1,
  validateCapabilities,
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
      sizeBytes: 0,
      sizePending: true,
      sizeHasErrors: false,
      formattedSize: "0 B",
      lastModified: null,
    },
  });

  assert.equal(target.target.id, "scan-1-target-1");
  assert.equal(target.target.name, "node_modules");
  assert.equal(target.target.formattedSize, "");
  assert.equal(target.target.sizePending, true);
  assert.equal(target.target.lastModified, null);
});

test("rejects malformed target display fields", () => {
  const baseTarget = {
    id: "scan-1-target-1",
    path: "C:\\workspace\\node_modules",
    category: "NodeModules",
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

test("rejects malformed capability payloads before action gating", () => {
  assert.throws(
    () => unwrapV1(
      { apiVersion: "v1", platform: "windows", data: { permanent: true, trash: "yes", secureIdentity: false }, error: null },
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
        data: { scanId: "scan-1", target: { id: "", path: "C:\\temp", category: "Cache", sizeBytes: 1, sizePending: false, sizeHasErrors: false, formattedSize: "1 B" } },
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
    toUiError({ code: "permission_denied", message: "Access denied", path: null, operation: "scan" }),
    { code: "permission_denied", message: "Access denied" },
  );
});

test("gates cleanup actions from capability booleans", () => {
  assert.equal(canUseCleanupMode({ permanent: true, trash: false, secureIdentity: true }, "Permanent"), true);
  assert.equal(canUseCleanupMode({ permanent: false, trash: true, secureIdentity: false }, "Permanent"), false);
  assert.equal(canUseCleanupMode({ permanent: false, trash: true, secureIdentity: false }, "Trash"), true);
});
