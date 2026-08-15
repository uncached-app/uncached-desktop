import assert from "node:assert/strict";
import test from "node:test";
import { nodeRadius, workspaceGraph } from "../src/utils/graph.mjs";

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
  assert.deepEqual(result.labels, []);
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

test("a package whose projects are not in the picture is not in it either", () => {
  // The duplicate report is taken for a whole workspace and outlives it: change
  // the chosen folders and it answers about the previous ones until the next
  // reading settles. Drawn from the report alone, the middle filled with rings
  // and not one line leaving them.
  const result = graph({
    projects: [project("api")],
    packages: [shared("react", ["gone-1", "gone-2", "gone-3"])],
  });

  assert.deepEqual(result.nodes.filter((node) => node.kind === "package"), []);
  assert.equal(result.sharesNothing, true);
});

test("a package only one visible project holds is not shared here", () => {
  // Narrowed to two projects, a package installed in nine of them is one copy
  // and one copy. The ring would be a claim the drawing cannot support.
  const result = graph({
    projects: [project("api"), project("web")],
    packages: [shared("react", ["api", "gone-1", "gone-2"])],
  });

  assert.deepEqual(result.nodes.filter((node) => node.kind === "package"), []);
});

test("a package says how many of its copies are actually drawn", () => {
  const result = graph({
    projects: [project("api"), project("web")],
    packages: [shared("react", ["api", "web", "elsewhere"])],
  });

  const react = result.nodes.find((node) => node.kind === "package");
  assert.equal(react.detail, "2 of 3 copies here");
  assert.equal(result.edges.filter((edge) => edge.kind === "copy").length, 2);
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
  // the layout, because two closed-form versions of it were wrong — and each
  // was invisible except in the workspace that happened to hit it.
  for (const aspect of [1, 1.6, 2.4]) {
    for (let count = 1; count <= 250; count += 3) {
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

  const placed = members.map((name) => result.nodes.find((node) => node.path === `/w/uncached-app/${name}`));
  assert.ok(placed.every(Boolean));
  assert.equal(new Set(placed.map((node) => node.unit)).size, 1, "one unit, placed once");
});

test("a family is an outline round its cluster, not a wiring diagram", () => {
  const members = ["a", "b", "c", "d"];
  const projects = members.map((name) => ({ ...project(name), path: `/w/mono/${name}` }));
  const result = graph({ projects, families: [family("mono", members)] });

  // Four projects wired into a quadrilateral read as four things wired
  // together; the same four inside one shape read as one thing.
  assert.equal(result.edges.length, 0);
  assert.equal(result.labels.length, 1);
  assert.equal(result.labels[0].text, "mono");
  assert.equal(result.labels[0].outline.length, 4);
  assert.deepEqual(result.labels[0].paths.sort(), members.map((name) => `/w/mono/${name}`));
});

test("a large family is a disc, not a hoop the size of the window", () => {
  // Forty packages on one ring is a circumference forty nodes long with a hole
  // the same size in the middle — a circle wider than the window, with the rest
  // of the workspace beside it. That is what a declared monorepo drew.
  const size = (count) => {
    const members = Array.from({ length: count }, (_, at) => `m-${at}`);
    const projects = members.map((name) => ({ ...project(name), path: `/w/mono/${name}` }));
    const result = graph({ projects, families: [family("mono", members, "pnpm")] });
    return result.labels[0].reach;
  };

  // Four times the members is twice the reach, not four times it.
  const ratio = size(40) / size(10);
  assert.ok(ratio < 2.6, `a family of forty reached ${ratio.toFixed(1)}x a family of ten`);
});

test("the outline passes outside every member, never through one", () => {
  const members = ["a", "b", "c", "d", "e"];
  const projects = members.map((name) => ({ ...project(name), path: `/w/mono/${name}` }));
  const result = graph({ projects, families: [family("mono", members)] });
  const label = result.labels[0];

  for (const point of label.outline) {
    const out = Math.hypot(point.x - label.x, point.y - label.y);
    assert.ok(out > label.reach, "the outline cuts through the ring its members sit on");
  }
});

test("a family's name sits in the middle of its own cluster", () => {
  // Hung below it, the name lands wherever the cluster happens to sit on the
  // ring — over whatever is beneath it, reading as a label for the neighbour.
  const members = ["a", "b", "c", "d"];
  const projects = members.map((name) => ({ ...project(name), path: `/w/mono/${name}` }));
  const result = graph({ projects, families: [family("mono", members)] });

  const placed = result.nodes.filter((node) => node.path?.startsWith("/w/mono/"));
  const label = result.labels[0];
  const middle = {
    x: placed.reduce((total, node) => total + node.x, 0) / placed.length,
    y: placed.reduce((total, node) => total + node.y, 0) / placed.length,
  };

  assert.ok(Math.abs(label.x - middle.x) < 1e-9);
  assert.ok(Math.abs(label.y - middle.y) < 1e-9);
  // And every member is further out than the name is, which is what makes the
  // middle a place to put one.
  for (const node of placed) {
    assert.ok(Math.hypot(node.x - label.x, node.y - label.y) > 0, "a member sits on the name");
  }
  assert.ok(label.reach > 0);
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

test("a small workspace is a small picture, not a hoop with a hole", () => {
  // Seven projects, five of them one family, drew as three things as far apart
  // as a ring sized for the largest of them could put them. The ring is fitted
  // to what is on it now.
  const members = ["a", "b", "c", "d", "e"];
  const projects = [
    ...members.map((name) => ({ ...project(name), path: `/w/app/${name}` })),
    project("solo-1"),
    project("solo-2"),
  ];
  const result = graph({ projects, families: [family("app", members)], aspect: 1.6 });

  assert.ok(result.extent.width <= 1.6, `spans ${result.extent.width.toFixed(2)} of a 1.6 box`);
  assert.ok(result.extent.height <= 1, `spans ${result.extent.height.toFixed(2)} of a 1.0 box`);
});

test("a large workspace reaches past the frame instead of being squeezed into it", () => {
  // The failure this replaces: fitting the finished layout to the window, which
  // drew a hundred and forty projects in the same rectangle as twelve with
  // every gap shrunk to a tenth — a ball of dots with the names on top of each
  // other, which is what fitting was supposed to avoid.
  const box = { width: 1.6, height: 1 };
  const small = graph({ projects: Array.from({ length: 8 }, (_, at) => project(`p-${at}`)), aspect: 1.6 });
  const large = graph({ projects: Array.from({ length: 140 }, (_, at) => project(`p-${at}`)), aspect: 1.6 });

  assert.ok(small.extent.height <= box.height, "a small workspace still fits");
  assert.ok(large.extent.height > box.height * 2, "a large one goes well past it");
});

test("a node is the same size whatever the workspace holds", () => {
  const size = (count) =>
    graph({ projects: Array.from({ length: count }, (_, at) => project(`p-${at}`)) }).maxRadius;

  assert.equal(size(30), size(200));
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

test("every node lands inside the extent the graph reports", () => {
  // Nodes are no longer inside the frame — that is the point — so what has to
  // hold is that the rectangle handed to the view covers all of them. A view
  // that fits the reported extent and still cuts something off is a corner the
  // user cannot reach.
  const projects = Array.from({ length: 60 }, (_, at) => project(`p-${at}`));
  const result = graph({ projects, packages: [shared("react", ["p-1", "p-2", "p-3"])] });
  const { x, y, width, height } = result.extent;

  for (const node of result.nodes) {
    assert.ok(node.x >= x && node.x <= x + width, `${node.id} x=${node.x}`);
    assert.ok(node.y >= y && node.y <= y + height, `${node.id} y=${node.y}`);
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

test("a workspace of any size draws, because the view is what moves", () => {
  // The ceiling this replaces was decided before the map could be panned or
  // zoomed. Once it could, "too many to draw" stopped being true: the picture
  // packs outward at a constant node size and reading it is a matter of how
  // close you are.
  for (const count of [1, 40, 150, 250]) {
    const projects = Array.from({ length: count }, (_, at) => project(`p-${at}`));
    const result = graph({ projects });

    assert.equal(result.nodes.length, count);
    for (const node of result.nodes) {
      assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `${count}: ${node.id} has no place`);
    }
  }
});

test("the picture grows with the workspace instead of the nodes shrinking", () => {
  // A ring divided evenly halves every gap when the workspace doubles. Packing
  // outward keeps the spacing and spends the room, which is what makes zooming
  // worth anything.
  const rings = (count) =>
    new Set(
      workspaceGraph({
        projects: Array.from({ length: count }, (_, at) => project(`p-${at}`)),
        footprints: {},
        verdicts: {},
        packages: [],
        aspect: 1,
      }).nodes.map((node) => Math.hypot(node.x - 0.5, node.y - 0.5).toFixed(2)),
    ).size;

  assert.ok(rings(160) > rings(12), "a large workspace uses more than one ring");
});

test("a family is a cluster, not four slots the size of unrelated projects", () => {
  const members = ["a", "b", "c", "d"];
  const projects = [
    ...members.map((name) => ({ ...project(name), path: `/w/mono/${name}` })),
    ...Array.from({ length: 20 }, (_, at) => project(`solo-${at}`)),
  ];
  const result = graph({ projects, families: [family("mono", members)] });

  const inside = members.map((name) => result.nodes.find((node) => node.path === `/w/mono/${name}`));
  const middle = {
    x: inside.reduce((total, node) => total + node.x, 0) / inside.length,
    y: inside.reduce((total, node) => total + node.y, 0) / inside.length,
  };
  const reach = Math.max(...inside.map((node) => Math.hypot(node.x - middle.x, node.y - middle.y)));

  // Every member is nearer the cluster's middle than any outsider is.
  const nearest = Math.min(
    ...result.nodes
      .filter((node) => !node.path?.startsWith("/w/mono/"))
      .map((node) => Math.hypot(node.x - middle.x, node.y - middle.y)),
  );
  assert.ok(nearest > reach, "an unrelated project landed inside the family");
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
