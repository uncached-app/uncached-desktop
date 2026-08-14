import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_POLICY, ELIGIBLE_VERDICTS, previewPolicy } from "../src/utils/maintenance.mjs";

const GB = 1024 * 1024 * 1024;

function project(name, idleDays = 200) {
  return {
    name,
    path: `/w/${name}`,
    root: "/w",
    kind: "Node",
    git: { branch: "main", remote: "origin", recoverability: {} },
    activity: { idleDays, state: idleDays > 60 ? "cold" : "active" },
    duplicateOf: [],
    installMissing: false,
    installStale: false,
  };
}

function preview(projects, verdicts, footprints, policy = DEFAULT_POLICY) {
  return previewPolicy({ projects, verdicts, footprints, policy });
}

const footprint = (bytes) => ({
  totalBytes: bytes,
  sourceBytes: 0,
  reclaimableBytes: bytes,
  freeReclaimableBytes: bytes,
  byCategory: [],
  hasErrors: false,
});

test("only the safe verdict is ever eligible", () => {
  assert.deepEqual(ELIGIBLE_VERDICTS, ["safe"], "widening this is a safety decision, not a setting");
});

test("a cold project with everything on a remote is selected", () => {
  const result = preview(
    [project("old-dashboard", 218)],
    { "/w/old-dashboard": "safe" },
    { "/w/old-dashboard": footprint(22 * GB) },
  );

  assert.equal(result.selected.length, 1);
  assert.equal(result.bytes, 22 * GB);
});

test("work that exists only on this disk is never selected, however cold", () => {
  const result = preview(
    [project("unpushed", 900)],
    { "/w/unpushed": "protect" },
    { "/w/unpushed": footprint(50 * GB) },
  );

  assert.deepEqual(result.selected, []);
  assert.equal(result.protectedCount, 1);
  assert.equal(result.skipped[0].reason, "verdict");
});

test("a verdict the core could not reach stops the policy rather than defaulting", () => {
  for (const verdict of ["unknown", "tradeOff", "broken", "staleDeps", "archivable"]) {
    const result = preview(
      [project("x", 500)],
      { "/w/x": verdict },
      { "/w/x": footprint(40 * GB) },
    );
    assert.deepEqual(result.selected, [], `${verdict} must not be automated`);
  }
});

test("a project with no measurement yet is unknown, not empty", () => {
  const result = preview([project("pending", 400)], { "/w/pending": "safe" }, {});
  assert.deepEqual(result.selected, []);
  assert.equal(result.skipped[0].reason, "unmeasured");
});

test("a project whose activity cannot be read is never selected", () => {
  const unreadable = { ...project("mystery"), activity: { idleDays: null, state: "unknown" } };
  const result = preview([unreadable], { "/w/mystery": "safe" }, { "/w/mystery": footprint(9 * GB) });

  assert.deepEqual(result.selected, []);
  assert.equal(result.skipped[0].reason, "unknownActivity");
});

test("recent work is left alone, and the reason says so", () => {
  const result = preview([project("api", 12)], { "/w/api": "safe" }, { "/w/api": footprint(30 * GB) });

  assert.deepEqual(result.selected, []);
  assert.equal(result.skipped[0].reason, "tooRecent");
  assert.equal(result.skipped[0].idleDays, 12);
});

test("a run is never noise", () => {
  const result = preview([project("tiny", 400)], { "/w/tiny": "safe" }, { "/w/tiny": footprint(2 * 1024 * 1024) });

  assert.deepEqual(result.selected, []);
  assert.equal(result.skipped[0].reason, "tooSmall");
});

test("the age threshold is the user's, and it is honoured", () => {
  const projects = [project("a", 45), project("b", 120)];
  const verdicts = { "/w/a": "safe", "/w/b": "safe" };
  const footprints = { "/w/a": footprint(5 * GB), "/w/b": footprint(5 * GB) };

  const strict = preview(projects, verdicts, footprints, { ...DEFAULT_POLICY, minIdleDays: 90 });
  assert.deepEqual(strict.selected.map((entry) => entry.project.name), ["b"]);

  const relaxed = preview(projects, verdicts, footprints, { ...DEFAULT_POLICY, minIdleDays: 30 });
  assert.equal(relaxed.selected.length, 2);
});

test("the heaviest selection leads, so a preview reads top down", () => {
  const projects = [project("small", 400), project("large", 400)];
  const result = preview(
    projects,
    { "/w/small": "safe", "/w/large": "safe" },
    { "/w/small": footprint(1 * GB), "/w/large": footprint(30 * GB) },
  );

  assert.deepEqual(result.selected.map((entry) => entry.project.name), ["large", "small"]);
});

test("a policy that matches nothing still explains itself", () => {
  const result = preview(
    [project("api", 3), project("secret", 400)],
    { "/w/api": "safe", "/w/secret": "protect" },
    { "/w/api": footprint(9 * GB), "/w/secret": footprint(9 * GB) },
  );

  assert.deepEqual(result.selected, []);
  assert.equal(result.skipped.length, 2, "silence is indistinguishable from a broken policy");
  assert.deepEqual(
    result.skipped.map((entry) => entry.reason).sort(),
    ["tooRecent", "verdict"],
  );
});

test("the default policy is off and moves to the Trash", () => {
  assert.equal(DEFAULT_POLICY.enabled, false, "automation is opt-in");
  assert.equal(DEFAULT_POLICY.mode, "Trash");
});
