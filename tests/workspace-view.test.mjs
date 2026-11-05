import test from "node:test";
import assert from "node:assert/strict";
import {
  countByRoot,
  countCategories,
  countVerdicts,
  groupByFamily,
  groupByVerdict,
  narrowProjects,
  rankBySize,
  scopeProjects,
  sumFootprints,
  visibleFamilies,
} from "../src/utils/workspaceView.mjs";

const project = (path, overrides = {}) => ({
  name: path.split("/").pop(),
  path,
  root: "/w",
  kind: "node",
  git: { branch: null },
  duplicateOf: [],
  ...overrides,
});

const footprint = (totalBytes, reclaimableBytes, categories = []) => ({
  totalBytes,
  reclaimableBytes,
  byCategory: categories.map((category) => ({ category, bytes: 1 })),
});

const noFilters = {
  activeVerdict: null,
  verdicts: {},
  activeCategory: null,
  footprints: {},
  clonesOnly: false,
  activePackage: null,
};

const paths = (projects) => projects.map((entry) => entry.path);

test("scope matches root and the query against name, path, kind and branch", () => {
  const projects = [
    project("/w/api", { git: { branch: "feature/login" } }),
    project("/w/web", { kind: "rust" }),
    project("/x/tool", { root: "/x" }),
  ];
  assert.deepEqual(paths(scopeProjects(projects, "/w", "")), ["/w/api", "/w/web"]);
  assert.deepEqual(paths(scopeProjects(projects, null, "login")), ["/w/api"]);
  assert.deepEqual(paths(scopeProjects(projects, null, "rust")), ["/w/web"]);
  assert.deepEqual(paths(scopeProjects(projects, "/x", "api")), []);
});

test("filters compose, and the excluded dimension is skipped", () => {
  const projects = [
    project("/w/a", { duplicateOf: ["/w/b"] }),
    project("/w/b", { duplicateOf: ["/w/a"] }),
    project("/w/c"),
  ];
  const filters = {
    ...noFilters,
    activeVerdict: "safe",
    verdicts: { "/w/a": "safe", "/w/c": "safe" },
    clonesOnly: true,
  };
  assert.deepEqual(paths(narrowProjects(projects, filters, null)), ["/w/a"]);
  assert.deepEqual(paths(narrowProjects(projects, filters, "clones")), ["/w/a", "/w/c"]);
  assert.deepEqual(paths(narrowProjects(projects, filters, "verdict")), ["/w/a", "/w/b"]);
});

test("a package filter is never excluded and a missing verdict reads as unknown", () => {
  const projects = [project("/w/a"), project("/w/b")];
  const filters = {
    ...noFilters,
    activeVerdict: "unknown",
    activePackage: { name: "left-pad", version: "1.0.0", projects: ["/w/b"] },
  };
  assert.deepEqual(paths(narrowProjects(projects, filters, "verdict")), ["/w/b"]);
  assert.deepEqual(paths(narrowProjects(projects, filters, null)), ["/w/b"]);
});

test("category counts sort by count, then by name", () => {
  const footprints = {
    "/w/a": footprint(0, 0, ["NodeModules", "Turbo"]),
    "/w/b": footprint(0, 0, ["NodeModules", "CargoTarget"]),
  };
  assert.deepEqual(countCategories([project("/w/a"), project("/w/b")], footprints), [
    ["NodeModules", 2],
    ["CargoTarget", 1],
    ["Turbo", 1],
  ]);
});

test("verdict counts follow the given order and omit empty verdicts", () => {
  const verdicts = { "/w/a": "safe", "/w/b": "protect" };
  const projects = [project("/w/a"), project("/w/b"), project("/w/c")];
  assert.deepEqual(countVerdicts(projects, verdicts, ["protect", "safe", "tradeOff", "unknown"]), [
    ["protect", 1],
    ["safe", 1],
    ["unknown", 1],
  ]);
});

test("totals ignore footprints of projects no longer indexed", () => {
  const footprints = { "/w/a": footprint(10, 4), "/gone": footprint(100, 100) };
  assert.deepEqual(sumFootprints([project("/w/a"), project("/w/b")], footprints), {
    totalBytes: 10,
    reclaimableBytes: 4,
  });
});

test("projects are counted per root", () => {
  const counts = countByRoot([project("/w/a"), project("/w/b"), project("/x/c", { root: "/x" })]);
  assert.deepEqual([...counts.entries()], [["/w", 2], ["/x", 1]]);
});

test("ranking by size uses disk weight, not reclaimable bytes", () => {
  const footprints = { "/w/a": footprint(5, 5), "/w/b": footprint(60, 0) };
  assert.deepEqual(paths(rankBySize([project("/w/a"), project("/w/b"), project("/w/c")], footprints)), [
    "/w/b",
    "/w/a",
    "/w/c",
  ]);
});

test("a family hidden down to one member is no longer a family", () => {
  const families = [{ path: "/w", name: "w", declaredBy: null, members: ["/w/a", "/w/b", "/w/c"] }];
  assert.deepEqual(visibleFamilies(families, [project("/w/a"), project("/w/b")])[0].members, ["/w/a", "/w/b"]);
  assert.deepEqual(visibleFamilies(families, [project("/w/a")]), []);
});

test("family groups sort by size and leave the rest alone, heaviest first", () => {
  const footprints = { "/w/a": footprint(0, 1), "/w/b": footprint(0, 9), "/w/c": footprint(0, 5) };
  const family = { path: "/w", name: "w", declaredBy: "pnpm", members: ["/w/a", "/w/b"] };
  const visible = [project("/w/a"), project("/w/b"), project("/w/c"), project("/w/d")];
  const { groups, alone } = groupByFamily([family], visible, footprints);
  assert.equal(groups.length, 1);
  assert.deepEqual(paths(groups[0].projects), ["/w/b", "/w/a"]);
  assert.deepEqual(paths(alone), ["/w/c", "/w/d"]);
});

test("verdict groups follow the order and sort by reclaimable bytes", () => {
  const verdicts = { "/w/a": "safe", "/w/b": "safe", "/w/c": "protect" };
  const footprints = { "/w/a": footprint(0, 1), "/w/b": footprint(0, 3) };
  const grouped = groupByVerdict(
    [project("/w/a"), project("/w/b"), project("/w/c")],
    verdicts,
    footprints,
    ["protect", "safe"],
  );
  assert.deepEqual(
    grouped.map(([verdict, members]) => [verdict, paths(members)]),
    [
      ["protect", ["/w/c"]],
      ["safe", ["/w/b", "/w/a"]],
    ],
  );
});
