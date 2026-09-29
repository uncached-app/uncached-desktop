import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import i18next from "i18next";
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
    byCategory,
    hasErrors: false,
  };
}

function build(projects, footprints, verdicts = {}, totals = null) {
  return buildInsights({ projects, footprints, verdicts, totals, formatBytes });
}

const english = i18next.createInstance();
await english.init({
  lng: "en",
  resources: {
    en: {
      translation: {
        insights: JSON.parse(
          readFileSync(new URL("../src/i18n/locales/en/insights.json", import.meta.url)),
        ),
      },
    },
  },
  interpolation: { escapeValue: false },
});

/** The sentence as the English interface shows it. Throws on a key the catalogue lacks. */
function render(insight) {
  const { key, params } = insight.message;
  assert.ok(english.exists(key, params), `${key} is not in the English catalogue`);
  return english.t(key, params);
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
  assert.deepEqual(cold.message, {
    key: "insights.highlights.findings.cold",
    params: { count: 1, days: 90, size: "22.00 GB" },
  });
  assert.equal(
    render(cold),
    "1 project has been untouched for over 90 days, holding 22.00 GB of regenerable output.",
  );
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
  assert.equal(heaviest.message.key, "insights.highlights.findings.heaviest");
  assert.deepEqual(heaviest.message.params, { name: "api", size: "14.00 GB" });
  assert.equal(render(heaviest), "api alone holds 14.00 GB that a build can regenerate.");
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
  assert.deepEqual(dominant.message, {
    key: "insights.highlights.findings.concentration",
    params: { percent: 90, category: "NodeModules", size: "9.00 GB" },
  });

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
  assert.deepEqual(insights[0].message, {
    key: "insights.highlights.findings.protect",
    params: { count: 1 },
  });
  assert.equal(render(insights[0]), "1 project holds work that exists only on this disk.");
  assert.doesNotMatch(render(insights[0]), /GB/, "the point is not how much it weighs");
});

test("nothing invents urgency", () => {
  const projects = [
    project("old", { activity: { idleDays: 300, state: "cold" } }),
    project("dup", { duplicateOf: ["/elsewhere/dup"] }),
  ];
  const footprints = { "/w/old": footprint(20 * GB), "/w/dup": footprint(5 * GB) };
  const insights = build(projects, footprints, { "/w/dup": "protect" });

  for (const insight of insights) {
    const text = render(insight);
    assert.doesNotMatch(text, /!|now|hurry|warning|danger|urgent/i, text);
  }
});

/**
 * The rule is that an action must be honourable, not that every sentence has
 * one. The map filters by root, text, verdict, artifact kind and clone; a
 * sentence pointing anywhere else has nowhere to send anyone, and a button that
 * opens an unfiltered list is a worse answer than no button.
 *
 * Asserted as a closed set rather than as "has an action", because the way this
 * regressed the first time was an action nobody had written a handler for. Add
 * a sixth kind here only once `follow` in `InsightsModule` can honour it.
 */
const REACHABLE = new Set(["verdict", "project", "category", "duplicates"]);

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
  assert.deepEqual(reclaimed.message, {
    key: "insights.highlights.findings.reclaimed",
    params: { count: 12, size: "238.00 GB" },
  });
  assert.equal(render(reclaimed), "You have reclaimed 238.00 GB with Uncached across 12 cleanups.");
  assert.equal(reclaimed.action, undefined, "the past has no destination");

  // The fixture has to actually produce the findings whose destinations were
  // once missing, or this passes by never reaching them — which is how the
  // original version of this assertion survived being wrong.
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

test("the clone finding points at the filter that shows the clones", () => {
  const insights = build(
    [project("dup", { duplicateOf: ["/elsewhere/dup"] })],
    { "/w/dup": footprint(5 * GB) },
  );
  const duplicates = insights.find((insight) => insight.id === "duplicates");

  assert.ok(duplicates, "a clone is still reported");
  assert.deepEqual(duplicates.action, { kind: "duplicates" });
});

test("the concentration finding names the kind the map should narrow to", () => {
  const concentration = build(
    [project("api")],
    { "/w/api": footprint(10 * GB, [
      { category: "NodeModules", bytes: 9 * GB },
      { category: "CargoTarget", bytes: 1 * GB },
    ]) },
  ).find((insight) => insight.id === "concentration");

  assert.deepEqual(
    concentration.action,
    { kind: "category", category: "NodeModules" },
    "the destination has to carry which kind, not just that there was one",
  );
});

test("history alone still speaks, on a workspace with nothing to report", () => {
  const totals = { allTimeBytes: 5 * GB, last30DaysBytes: 0, cleanups: 1, firstRecordedAt: null };
  const insights = build([project("api")], { "/w/api": footprint(0) }, {}, totals);
  assert.equal(insights.length, 1);
  assert.equal(insights[0].message.params.count, 1);
  assert.equal(
    render(insights[0]),
    "You have reclaimed 5.00 GB with Uncached across 1 cleanup.",
    "singular when it happened once",
  );
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
    assert.doesNotMatch(render(insight), /GB|MB|KB/, `${insight.id} leaked a measurement`);
  }

  // The one sentence that must never be withheld: warning someone they are
  // about to lose work is not a paid feature.
  const risk = (list) => list.find((insight) => insight.id === "protect").message;
  assert.deepEqual(risk(free), risk(paid), "the risk warning reads the same on every plan");
});

test("every finding has an English sentence with no placeholder left unfilled", () => {
  const projects = [
    project("old", { activity: { idleDays: 300, state: "cold" } }),
    project("dup", { duplicateOf: ["/elsewhere/dup"] }),
    project("stale"),
    project("secret"),
  ];
  const footprints = {
    "/w/old": footprint(20 * GB, [{ category: "NodeModules", bytes: 20 * GB }]),
    "/w/dup": footprint(5 * GB),
    "/w/stale": footprint(GB),
    "/w/secret": footprint(1024),
  };
  const verdicts = { "/w/stale": "staleDeps", "/w/secret": "protect" };
  const totals = { allTimeBytes: 3 * GB, last30DaysBytes: 0, cleanups: 2, firstRecordedAt: null };

  const insights = build(projects, footprints, verdicts, totals);
  assert.deepEqual(
    insights.map((insight) => insight.id).sort(),
    ["cold", "concentration", "duplicates", "heaviest", "protect", "reclaimed", "stale"],
  );
  for (const insight of insights) {
    assert.doesNotMatch(render(insight), /\{\{|\}\}|insights\./, insight.id);
  }
  assert.equal(
    render(insights.find((insight) => insight.id === "stale")),
    "1 project has dependencies that no longer match its lockfile.",
  );
});
