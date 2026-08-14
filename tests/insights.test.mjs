import assert from "node:assert/strict";
import test from "node:test";
import { REDACTED, buildInsights } from "../src/utils/insights.mjs";

const GB = 1024 * 1024 * 1024;
const formatBytes = (bytes) => `${(bytes / GB).toFixed(2)} GB`;

function project(name, overrides = {}) {
  return {
    name,
    path: `/w/${name}`,
    root: "/w",
    kind: "Node",
    git: { branch: "main", remote: null, recoverability: {} },
    activity: { idleDays: 3, state: "active", lastActivityAt: null },
    duplicateOf: [],
    installMissing: false,
    installStale: false,
    ...overrides,
  };
}

function footprint(reclaimable, byCategory = []) {
  return {
    totalBytes: reclaimable,
    sourceBytes: 0,
    reclaimableBytes: reclaimable,
    freeReclaimableBytes: reclaimable,
    byCategory,
    hasErrors: false,
  };
}

function build(projects, footprints, verdicts = {}, totals = null) {
  return buildInsights({ projects, footprints, verdicts, totals, formatBytes });
}

test("a quiet workspace produces no sentences at all", () => {
  const projects = [project("api")];
  const insights = build(projects, { "/w/api": footprint(1024) });
  assert.deepEqual(insights, [], "nothing measured is worth saying is worth no line");
});

test("cold and heavy is one finding, not two", () => {
  const projects = [
    project("old-dashboard", { activity: { idleDays: 218, state: "cold" } }),
    project("api", { activity: { idleDays: 2, state: "active" } }),
  ];
  const footprints = {
    "/w/old-dashboard": footprint(22 * GB),
    "/w/api": footprint(9 * GB),
  };

  const cold = build(projects, footprints).find((insight) => insight.id === "cold");
  assert.ok(cold, "a cold project holding 22 GB is worth a line");
  assert.match(cold.text, /1 project has been untouched/);
  assert.match(cold.text, /22\.00 GB/);
  assert.equal(cold.action.kind, "verdict");
});

test("an idle project with nothing to reclaim is not a finding", () => {
  const projects = [project("notes", { activity: { idleDays: 400, state: "cold" } })];
  const insights = build(projects, { "/w/notes": footprint(0) });
  assert.equal(
    insights.find((insight) => insight.id === "cold"),
    undefined,
    "idleness alone is not a reason to look",
  );
});

test("a small number never earns a sentence", () => {
  const projects = [project("tiny", { activity: { idleDays: 300, state: "cold" } })];
  const insights = build(projects, { "/w/tiny": footprint(4 * 1024 * 1024) });
  assert.deepEqual(insights, [], "4 MB is true and pointless");
});

test("the heaviest project is named, because a total says where nothing is", () => {
  const projects = [project("api"), project("web")];
  const footprints = { "/w/api": footprint(14 * GB), "/w/web": footprint(2 * GB) };

  const heaviest = build(projects, footprints).find((insight) => insight.id === "heaviest");
  assert.match(heaviest.text, /^api alone holds 14\.00 GB/);
  assert.deepEqual(heaviest.action, { kind: "project", path: "/w/api" });
});

test("one dominant artifact kind is a finding; an even spread is not", () => {
  const dominant = build(
    [project("api")],
    { "/w/api": footprint(10 * GB, [
      { category: "NodeModules", bytes: 9 * GB },
      { category: "CargoTarget", bytes: 1 * GB },
    ]) },
  ).find((insight) => insight.id === "concentration");
  assert.match(dominant.text, /90% of what you can reclaim is NodeModules/);

  const spread = build(
    [project("api")],
    { "/w/api": footprint(10 * GB, [
      { category: "NodeModules", bytes: 5 * GB },
      { category: "CargoTarget", bytes: 5 * GB },
    ]) },
  ).find((insight) => insight.id === "concentration");
  assert.equal(spread, undefined, "half and half names nothing");
});

test("work that exists only on this disk leads, and carries no byte count", () => {
  const projects = [project("api"), project("secret-work")];
  const footprints = { "/w/api": footprint(30 * GB), "/w/secret-work": footprint(1024) };
  const verdicts = { "/w/secret-work": "protect" };

  const insights = build(projects, footprints, verdicts);
  assert.equal(insights[0].id, "protect", "risk is not sorted by size");
  assert.match(insights[0].text, /1 project holds work that exists only on this disk/);
  assert.doesNotMatch(insights[0].text, /GB/, "the point is not how much it weighs");
});

test("nothing invents urgency", () => {
  const projects = [
    project("old", { activity: { idleDays: 300, state: "cold" } }),
    project("dup", { duplicateOf: ["/elsewhere/dup"] }),
  ];
  const footprints = { "/w/old": footprint(20 * GB), "/w/dup": footprint(5 * GB) };
  const insights = build(projects, footprints, { "/w/dup": "protect" });

  for (const insight of insights) {
    assert.doesNotMatch(insight.text, /!|now|hurry|warning|danger|urgent/i, insight.text);
  }
});

/**
 * The rule is that an action must be honourable, not that every sentence has
 * one. The workspace map filters by root, by text and by verdict — nothing
 * else — so a sentence about a category or a clone has nowhere to send anyone,
 * and a button that opens an unfiltered list is a worse answer than no button.
 *
 * Asserted as a closed set rather than as "has an action", because the way this
 * regressed the first time was an action nobody had written a handler for.
 */
const REACHABLE = new Set(["verdict", "project"]);

test("every sentence that offers a destination has one the map can reach", () => {
  const projects = [
    project("old", { activity: { idleDays: 300, state: "cold" } }),
    project("dup", { duplicateOf: ["/elsewhere/dup"] }),
  ];
  const footprints = { "/w/old": footprint(20 * GB), "/w/dup": footprint(5 * GB) };
  const totals = { allTimeBytes: 238 * GB, last30DaysBytes: 0, cleanups: 12, firstRecordedAt: null };

  const insights = build(projects, footprints, {}, totals);
  const reclaimed = insights.at(-1);

  assert.equal(reclaimed.id, "reclaimed", "history closes the list");
  assert.match(reclaimed.text, /238\.00 GB with Uncached across 12 cleanups/);
  assert.equal(reclaimed.action, undefined, "the past has no destination");

  // The fixture has to actually produce the two that carry no action, or this
  // passes by never reaching them — which is how the old assertion survived.
  const ids = insights.map((insight) => insight.id);
  assert.ok(ids.includes("duplicates"), "the fixture must exercise a clone finding");

  for (const insight of insights) {
    if (!insight.action) continue;
    assert.ok(
      REACHABLE.has(insight.action.kind),
      `${insight.id} points at "${insight.action.kind}", which the map cannot filter by`,
    );
  }
});

test("a finding the map cannot filter by is a sentence rather than a button", () => {
  const insights = build(
    [project("dup", { duplicateOf: ["/elsewhere/dup"] })],
    { "/w/dup": footprint(5 * GB) },
  );
  const duplicates = insights.find((insight) => insight.id === "duplicates");

  assert.ok(duplicates, "a clone is still reported");
  assert.equal(duplicates.action, undefined, "and reported without a destination it does not have");
});

test("history alone still speaks, on a workspace with nothing to report", () => {
  const totals = { allTimeBytes: 5 * GB, last30DaysBytes: 0, cleanups: 1, firstRecordedAt: null };
  const insights = build([project("api")], { "/w/api": footprint(0) }, {}, totals);
  assert.equal(insights.length, 1);
  assert.match(insights[0].text, /1 cleanup\b/, "singular when it happened once");
});

test("a plan without measurements reads every finding and none of the numbers", () => {
  const projects = [
    project("old", { activity: { idleDays: 300, state: "cold" } }),
    project("secret", { activity: { idleDays: 1, state: "active" } }),
  ];
  const footprints = { "/w/old": footprint(20 * GB), "/w/secret": footprint(1024) };
  const verdicts = { "/w/secret": "protect" };

  const paid = build(projects, footprints, verdicts);
  const free = buildInsights({
    projects,
    footprints,
    verdicts,
    totals: null,
    formatBytes: () => REDACTED,
  });

  assert.equal(free.length, paid.length, "the same findings are reported");
  assert.deepEqual(
    free.map((insight) => insight.id),
    paid.map((insight) => insight.id),
  );
  for (const insight of free) {
    assert.doesNotMatch(insight.text, /GB|MB|KB/, `${insight.id} leaked a measurement`);
  }

  // The one sentence that must never be withheld: warning someone they are
  // about to lose work is not a paid feature.
  const risk = (list) => list.find((insight) => insight.id === "protect").text;
  assert.equal(risk(free), risk(paid), "the risk warning reads the same on every plan");
});
