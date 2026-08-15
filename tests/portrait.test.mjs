import assert from "node:assert/strict";
import test from "node:test";
import { workspacePortrait } from "../src/utils/portrait.mjs";

const GB = 1024 * 1024 * 1024;

function project(name) {
  return { name, path: `/w/${name}` };
}

function footprint(total, reclaimable, byCategory = []) {
  return { totalBytes: total, reclaimableBytes: reclaimable, byCategory };
}

test("an empty workspace is a picture of nothing rather than a crash", () => {
  const portrait = workspacePortrait({ projects: [], footprints: {}, verdicts: {} });

  assert.equal(portrait.projects, 0);
  assert.equal(portrait.totalBytes, 0);
  assert.deepEqual(portrait.categories, []);
  assert.deepEqual(portrait.verdicts, []);
});

test("the totals are sums over what was actually measured", () => {
  const portrait = workspacePortrait({
    projects: [project("api"), project("web")],
    footprints: {
      "/w/api": footprint(10 * GB, 8 * GB),
      "/w/web": footprint(6 * GB, 2 * GB),
    },
    verdicts: {},
  });

  assert.equal(portrait.totalBytes, 16 * GB);
  assert.equal(portrait.reclaimableBytes, 10 * GB);
  assert.equal(portrait.sourceBytes, 6 * GB, "what is left once the artifacts go");
});

/**
 * The property the picture rests on. A project still being weighed is a project
 * with an unknown size, and folding it in as zero would show a total that
 * climbs while the user watches and a source figure that is simply wrong.
 */
test("a project that has not been weighed is counted but not summed", () => {
  const portrait = workspacePortrait({
    projects: [project("api"), project("unmeasured")],
    footprints: { "/w/api": footprint(10 * GB, 8 * GB) },
    verdicts: {},
  });

  assert.equal(portrait.projects, 2, "it is here");
  assert.equal(portrait.measured, 1);
  assert.equal(portrait.pending, 1, "and the picture can say it is partial");
  assert.equal(portrait.totalBytes, 10 * GB, "its unknown size is not zero");
});

test("categories are summed across every project, heaviest first", () => {
  const portrait = workspacePortrait({
    projects: [project("api"), project("web")],
    footprints: {
      "/w/api": footprint(10 * GB, 9 * GB, [
        { category: "NodeModules", bytes: 6 * GB },
        { category: "CargoTarget", bytes: 3 * GB },
      ]),
      "/w/web": footprint(4 * GB, 4 * GB, [{ category: "NodeModules", bytes: 4 * GB }]),
    },
    verdicts: {},
  });

  assert.deepEqual(portrait.categories, [
    { category: "NodeModules", bytes: 10 * GB },
    { category: "CargoTarget", bytes: 3 * GB },
  ]);
});

test("a project with no verdict yet is grouped as unknown, not dropped", () => {
  const portrait = workspacePortrait({
    projects: [project("api"), project("web"), project("old")],
    footprints: {},
    verdicts: { "/w/api": "safe", "/w/web": "safe" },
  });

  assert.deepEqual(portrait.verdicts, [
    { verdict: "safe", count: 2 },
    { verdict: "unknown", count: 1 },
  ]);
  assert.equal(
    portrait.verdicts.reduce((sum, entry) => sum + entry.count, 0),
    portrait.projects,
    "every project lands in exactly one group",
  );
});

test("verdict groups of equal size keep a stable order", () => {
  const portrait = workspacePortrait({
    projects: [project("a"), project("b")],
    footprints: {},
    verdicts: { "/w/a": "tradeOff", "/w/b": "protect" },
  });

  assert.deepEqual(
    portrait.verdicts.map((entry) => entry.verdict),
    ["protect", "tradeOff"],
    "a tie is broken by name rather than by map insertion order",
  );
});

test("a footprint with no category breakdown still counts toward the totals", () => {
  const portrait = workspacePortrait({
    projects: [project("api")],
    footprints: { "/w/api": { totalBytes: 5 * GB, reclaimableBytes: 0 } },
    verdicts: {},
  });

  assert.equal(portrait.totalBytes, 5 * GB);
  assert.deepEqual(portrait.categories, []);
});
