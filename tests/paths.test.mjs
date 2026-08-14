import assert from "node:assert/strict";
import test from "node:test";
import { baseName, isInside, relativeTo } from "../src/utils/paths.mjs";

test("a project owns what sits under it, and itself", () => {
  assert.ok(isInside("/work/api/node_modules", "/work/api"));
  assert.ok(isInside("/work/api", "/work/api"));
  assert.ok(isInside("/work/api/", "/work/api"), "a trailing separator is not a different folder");
});

/** The one trap in the whole file. */
test("a shared prefix is not containment", () => {
  assert.equal(isInside("/work-archive/api", "/work"), false);
  assert.equal(isInside("/workshop", "/work"), false);
});

test("both separators count, because both occur", () => {
  assert.ok(isInside("C:\\work\\api\\node_modules", "C:\\work\\api"));
  assert.equal(isInside("C:\\work-archive", "C:\\work"), false);
});

test("nothing is inside nothing", () => {
  assert.equal(isInside("/work/api", ""), false);
  assert.equal(isInside("", "/work"), false);
  assert.equal(isInside(null, "/work"), false);
});

test("a path is named by its last segment", () => {
  assert.equal(baseName("/work/api"), "api");
  assert.equal(baseName("/work/api/"), "api");
  assert.equal(baseName("C:\\work\\api"), "api");
});

test("an artifact is named by where it sits in its project", () => {
  assert.equal(relativeTo("/work/api/ios/Pods", "/work/api"), "ios/Pods");
  assert.equal(relativeTo("/work/api/node_modules", "/work/api/"), "node_modules");
  assert.equal(
    relativeTo("/elsewhere/thing", "/work/api"),
    "/elsewhere/thing",
    "an unrelated path keeps its whole name rather than being mangled",
  );
});
