import test from "node:test";
import assert from "node:assert/strict";
import { canUseCleanupMode, toUiError, unwrapV1 } from "./apiContract.ts";

test("unwraps a successful v1 envelope", () => {
  assert.equal(unwrapV1({ apiVersion: "v1", platform: "windows", data: { value: 1 }, error: null }).value, 1);
});

test("rejects unknown API versions", () => {
  assert.throws(() => unwrapV1({ apiVersion: "v2", platform: "windows", data: {}, error: null }), /Unsupported API version/);
});

test("rejects envelopes with invalid data and error shape", () => {
  assert.throws(() => unwrapV1({ apiVersion: "v1", platform: "windows", data: {}, error: {} }), /exactly one/);
  assert.throws(() => unwrapV1({ apiVersion: "v1", platform: "windows", data: null, error: null }), /exactly one/);
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
