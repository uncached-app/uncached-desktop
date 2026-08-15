import assert from "node:assert/strict";
import test from "node:test";
import { MAX_NODES, nodeRadius, workspaceGraph } from "../src/utils/graph.mjs";

const GB = 1024 * 1024 * 1024;

function project(name, overrides = {}) {
  return { name, path: `/w/${name}`, kind: "node", duplicateOf: [], ...overrides };
}

function shared(name, projects, wastedBytes = GB) {
  return {
    name,
    version: "1.0.0",
    copies: projects.length,
    bytesEach: wastedBytes,
    wastedBytes,
    projects: projects.map((entry) => `/w/${entry}`),
    samplePath: `/w/${projects[0]}/node_modules/${name}`,
  };
}

function family(name, members, declaredBy = null) {
  return { path: `/w/${name}`, name, declaredBy, members: members.map((entry) => `/w/${name}/${entry}`) };
}

function graph({ projects = [], footprints = {}, verdicts = {}, packages = [], families = [], aspect } = {}) {
  return workspaceGraph({ projects, footprints, verdicts, packages, families, aspect });
}

test("an empty workspace is an empty picture rather than a crash", () => {
  const result = graph();

  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.edges, []);
  assert.equal(result.tooLarge, false);
});

test("a package installed in one project is not shared and is not drawn", () => {
  const result = graph({
    projects: [project("api")],
    packages: [shared("react", ["api"])],
  });

  assert.deepEqual(result.nodes.filter((node) => node.kind === "package"), []);
  assert.deepEqual(result.edges, []);
});

test("a package in three projects is a node with an edge to each", () => {
  const result = graph({
    projects: [project("api"), project("web"), project("admin")],
    packages: [shared("react", ["api", "web", "admin"])],
  });

  const packages = result.nodes.filter((node) => node.kind === "package");
  assert.equal(packages.length, 1);
  assert.equal(packages[0].label, "react");
  assert.equal(result.edges.filter((edge) => edge.kind === "copy").length, 3);
});

test("an edge is never drawn to a project that is not in the picture", () => {
  // The duplicate report reads projects the index may since have dropped.
  const result = graph({
    projects: [project("api"), project("web")],
    packages: [shared("react", ["api", "web", "gone"])],
  });

  assert.equal(result.edges.length, 2);
  assert.ok(!result.edges.some((edge) => edge.to.includes("gone")));
});

test("two checkouts of one repository are one line, not two", () => {
  const result = graph({
    projects: [
      project("api", { duplicateOf: ["/w/api-copy"] }),
      project("api-copy", { duplicateOf: ["/w/api"] }),
    ],
  });

  const clones = result.edges.filter((edge) => edge.kind === "clone");
  assert.equal(clones.length, 1);
  assert.equal(clones[0].from, "project:/w/api");
  assert.equal(clones[0].to, "project:/w/api-copy");
});

test("only the heaviest packages are drawn, and the rest are counted", () => {
  const packages = Array.from({ length: 20 }, (_, at) =>
    shared(`pkg-${at}`, ["api", "web"], (20 - at) * GB),
  );
  const result = graph({ projects: [project("api"), project("web")], packages });

  const drawn = result.nodes.filter((node) => node.kind === "package");
  assert.equal(drawn.length, 12);
  assert.equal(drawn[0].label, "pkg-0");
  assert.equal(result.packagesOmitted, 8);
});

test("projects sharing a package land beside each other without a simulation", () => {
  const result = graph({
    projects: [project("api"), project("alone"), project("web")],
    packages: [shared("react", ["api", "web"])],
  });

  const at = (name) => result.nodes.findIndex((node) => node.path === `/w/${name}`);
  const angleOf = (name) => result.nodes[at(name)].angle;
  const step = (Math.PI * 2) / 3;

  // Adjacent on the ring, not identical: eleven projects that all carry React
  // want one point, and drawing them all there is one circle hiding ten.
  assert.ok(Math.abs(angleOf("api") - angleOf("web")) - step < 1e-9);
  assert.notEqual(angleOf("api"), angleOf("web"));
});

test("no two projects are ever drawn at the same point", () => {
  // Every project carrying exactly the same package: the case that wants one
  // shared angle for all of them.
  const names = ["a", "b", "c", "d", "e"];
  const result = graph({
    projects: names.map((name) => project(name)),
    packages: [shared("react", names)],
  });

  const places = result.nodes
    .filter((node) => node.kind === "project")
    .map((node) => `${node.x.toFixed(6)},${node.y.toFixed(6)}`);

  assert.equal(new Set(places).size, names.length);
});

test("no two nodes are drawn through each other, at any size or shape", () => {
  // The ceiling is measured from the placed positions rather than derived from
  // the ring, because two closed-form versions of it were wrong — and each was
  // invisible except in the workspace that happened to hit it.
  for (const aspect of [1, 1.6, 2.4]) {
    for (let count = 1; count <= 140; count += 1) {
      const projects = Array.from({ length: count }, (_, at) => project(`p-${at}`));
      const footprints = Object.fromEntries(
        projects.map((entry, at) => [entry.path, { totalBytes: (at + 1) * GB }]),
      );
      const packages = count > 6 ? [shared("react", ["p-1", "p-2", "p-3"])] : [];
      const result = workspaceGraph({ projects, footprints, verdicts: {}, packages, aspect });
      const heaviest = count * GB;

      const drawn = result.nodes.map((node) => ({
        x: node.x,
        y: node.y,
        r: nodeRadius(node.weight, heaviest, result.maxRadius),
      }));

      for (let left = 0; left < drawn.length; left += 1) {
        for (let right = left + 1; right < drawn.length; right += 1) {
          const gap = Math.hypot(drawn[left].x - drawn[right].x, drawn[left].y - drawn[right].y);
          assert.ok(
            gap >= drawn[left].r + drawn[right].r - 1e-9,
            `${count} projects at aspect ${aspect}: nodes ${left} and ${right} overlap`,
          );
        }
      }
    }
  }
});

test("a family stays together instead of being sorted apart by name", () => {
  // The workspace this came from: four folders under one `uncached-app`, drawn
  // as four unrelated dots because the index never said they were one thing.
  const members = ["uncached-desktop", "uncached-core", "uncached-cli", "uncached-web"];
  const projects = [
    project("alpha"),
    ...members.map((name) => ({ ...project(name), path: `/w/uncached-app/${name}` })),
    project("zulu"),
  ];
  const result = graph({ projects, families: [family("uncached-app", members)] });

  const angles = members
    .map((name) => result.nodes.find((node) => node.path === `/w/uncached-app/${name}`).angle)
    .sort((left, right) => left - right);

  const step = (Math.PI * 2) / projects.length;
  for (let at = 1; at < angles.length; at += 1) {
    assert.ok(
      angles[at] - angles[at - 1] <= step + 1e-9,
      "members of one family are adjacent on the ring",
    );
  }
});

test("a family is a chain through its members, not a line between every pair", () => {
  const members = ["a", "b", "c", "d"];
  const projects = members.map((name) => ({ ...project(name), path: `/w/mono/${name}` }));
  const result = graph({ projects, families: [family("mono", members)] });

  // Four members: three hops, not six crossing lines saying the same thing.
  assert.equal(result.edges.filter((edge) => edge.kind === "family").length, 3);
  assert.equal(result.labels.length, 1);
  assert.equal(result.labels[0].text, "mono");
});

test("a family label says whether a tool declared it or somebody just filed it there", () => {
  const projects = ["a", "b"].map((name) => ({ ...project(name), path: `/w/mono/${name}` }));

  assert.equal(graph({ projects, families: [family("mono", ["a", "b"])] }).labels[0].detail, "one folder");
  assert.equal(
    graph({ projects, families: [family("mono", ["a", "b"], "pnpm")] }).labels[0].detail,
    "pnpm workspace",
  );
});

test("a workspace sharing nothing says so rather than drawing an empty middle", () => {
  const result = graph({ projects: [project("api"), project("web")] });

  assert.equal(result.sharesNothing, true);
  assert.equal(graph({
    projects: [project("api"), project("web")],
    packages: [shared("react", ["api", "web"])],
  }).sharesNothing, false);
});

test("a wide window is used rather than framed with empty margins", () => {
  const projects = Array.from({ length: 12 }, (_, at) => project(`p-${at}`));
  const square = graph({ projects, aspect: 1 });
  const wide = graph({ projects, aspect: 2 });

  const span = (result) => {
    const xs = result.nodes.map((node) => node.x);
    return Math.max(...xs) - Math.min(...xs);
  };

  assert.ok(span(wide) > span(square) * 1.4, "the picture widens with the box");
  assert.equal(wide.width, 2);
});

test("a project carrying packages on both sides of the top is not flung to the bottom", () => {
  // Two packages, so they sit at the top and the bottom of the inner ring; a
  // project on both of them belongs at one of the sides, not at either pole.
  const result = graph({
    projects: [project("api")],
    packages: [shared("a", ["api", "x"], 2 * GB), shared("b", ["api", "x"], GB)],
  });

  const api = result.nodes.find((node) => node.path === "/w/api");
  assert.ok(Number.isFinite(api.angle));
  assert.ok(api.x >= 0 && api.x <= 1 && api.y >= 0 && api.y <= 1);
});

test("every node lands inside the unit square whatever the shape of the workspace", () => {
  const projects = Array.from({ length: 30 }, (_, at) => project(`p-${at}`));
  const result = graph({
    projects,
    packages: [shared("react", ["p-1", "p-2", "p-3"])],
  });

  for (const node of result.nodes) {
    assert.ok(node.x >= 0 && node.x <= 1, `${node.id} x=${node.x}`);
    assert.ok(node.y >= 0 && node.y <= 1, `${node.id} y=${node.y}`);
  }
});

test("the same workspace draws the same picture every time", () => {
  const input = {
    projects: [project("api"), project("web")],
    footprints: { "/w/api": { totalBytes: GB } },
    verdicts: { "/w/api": "safe" },
    packages: [shared("react", ["api", "web"])],
  };

  assert.deepEqual(graph(input), graph(input));
});

test("past the node ceiling the graph says so instead of drawing a hairball", () => {
  const projects = Array.from({ length: MAX_NODES + 1 }, (_, at) => project(`p-${at}`));

  assert.equal(graph({ projects }).tooLarge, true);
  assert.equal(graph({ projects: projects.slice(0, 10) }).tooLarge, false);
});

test("an unmeasured project draws at the floor rather than as the smallest thing here", () => {
  const result = graph({
    projects: [project("api"), project("unweighed")],
    footprints: { "/w/api": { totalBytes: 4 * GB } },
  });

  const unweighed = result.nodes.find((node) => node.path === "/w/unweighed");
  assert.equal(unweighed.weight, null);
  assert.equal(unweighed.bytes, 0);
  assert.equal(nodeRadius(unweighed.weight, 4 * GB, 0.05), nodeRadius(0, 4 * GB, 0.05));
});

test("node area is proportional to weight, so radius is not", () => {
  // Read against the floor, which every node gets before weight adds anything.
  const floor = nodeRadius(0, 4 * GB, 0.055);
  const quarter = nodeRadius(GB, 4 * GB, 0.055) - floor;
  const whole = nodeRadius(4 * GB, 4 * GB, 0.055) - floor;

  // Four times the bytes is four times the ink, which is twice the radius.
  assert.ok(Math.abs(whole / quarter - 2) < 1e-9);
});
