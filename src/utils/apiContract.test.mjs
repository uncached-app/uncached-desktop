import test from "node:test";
import assert from "node:assert/strict";
import { canUseCleanupMode, normalizeTargetFound, normalizeTargetSized, toUiError, unwrapV1 } from "./apiContract.ts";

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
