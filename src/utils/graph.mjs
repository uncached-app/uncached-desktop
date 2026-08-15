/**
 * The workspace as a graph, positioned.
 *
 * Three kinds of relationship, and the choice of which is the whole point. A
 * canvas of project nodes joined by folder membership draws what the sidebar
 * already says. What it cannot say is what is *shared*: one package sitting in
 * eleven projects at once, one repository checked out twice, and four folders
 * under one directory that are a single piece of work. So packages are nodes
 * too, families are chains, and clones are chords.
 *
 * Positions are computed, never simulated. A force layout settles somewhere
 * slightly different every run, which destroys the one thing a map is for —
 * that a project stays where you last saw it. Here the same workspace always
 * produces the same picture, so stability costs no stored file and there is
 * nothing to migrate later.
 *
 * Coordinates come out in a box `aspect` wide and `1` tall, so the picture
 * fills whatever it is drawn into rather than a square in the middle of it.
 */

/** Above this the picture stops being one, and the list is the honest answer. */
export const MAX_NODES = 150;

/** Shared packages worth drawing. The tail is a list, not a shape. */
export const MAX_PACKAGES = 12;

/** Kept clear at the edge, so a node's label has somewhere to go. */
const MARGIN = 0.1;

/**
 * How far the picture may stretch to fill a wide window. Beyond this a ring is
 * a horizon: two arcs at the top and bottom with the middle spent on nothing.
 */
const MAX_STRETCH = 1.9;

export function workspaceGraph({
  projects,
  footprints,
  verdicts,
  packages,
  families = [],
  limit = MAX_PACKAGES,
  aspect = 1,
}) {
  const shared = sharedPackages(packages, limit);
  const box = { width: Math.max(0.4, aspect), height: 1 };

  const packageNodes = placePackages(shared, box);
  const projectNodes = placeProjects({ projects, footprints, verdicts, shared, families, box });
  const nodes = [...packageNodes, ...projectNodes];

  return {
    nodes,
    edges: [
      ...copyEdges(shared, projects),
      ...cloneEdges(projects),
      ...familyEdges(families, projectNodes),
    ],
    /** One label per family, at the middle of its members. */
    labels: familyLabels(families, projectNodes),
    /** Packages left out of the picture because it only holds so many. */
    packagesOmitted: Math.max(0, countable(packages).length - shared.length),
    /** Nothing is installed in more than one project, so there is no middle. */
    sharesNothing: shared.length === 0,
    tooLarge: projects.length + shared.length > MAX_NODES,
    /**
     * The largest any node may draw before two of them touch — measured from
     * the positions rather than derived from the ring, because the layout is
     * the thing that changes and the arithmetic for each variant of it was
     * wrong twice before this replaced it.
     */
    maxRadius: separation(nodes) / 2,
    width: box.width,
    height: box.height,
  };
}

/** Only a package that is actually in more than one project is shared. */
function countable(packages) {
  return (packages ?? []).filter((entry) => entry.projects.length > 1);
}

function sharedPackages(packages, limit) {
  return [...countable(packages)]
    .sort((left, right) => right.wastedBytes - left.wastedBytes || left.name.localeCompare(right.name))
    .slice(0, limit);
}

/**
 * The shared packages in the middle, heaviest first, clockwise from the top.
 * Their angle is what every project's angle is derived from, so this ordering
 * decides the whole picture and has to be a total order — hence the name as the
 * tiebreaker on equal weight.
 */
function placePackages(shared, box) {
  return shared.map((entry, at) => {
    const angle = ring(at, shared.length);
    return {
      id: `package:${key(entry)}`,
      kind: "package",
      label: entry.name,
      detail: `${entry.copies} copies`,
      bytes: entry.wastedBytes,
      weight: entry.wastedBytes,
      angle,
      ...polar(angle, shared.length === 1 ? 0 : 0.36, box),
    };
  });
}

/**
 * Every project around the outside, in an order that means something.
 *
 * A family is contiguous, because four folders under one directory are one
 * piece of work and a map that scatters them by name is the map that started
 * this. Everything else is ordered by the average angle of the packages it
 * carries, so projects sharing dependencies sit together.
 *
 * Wanting a place is not getting it: eleven projects that all carry React want
 * one identical point, and drawing them there is one circle with ten behind it.
 * So the wants decide the *order* and the ring divides evenly.
 *
 * Rows alternate inward. With nothing in the middle to protect there are three
 * of them, spread wide enough to read as a disc rather than a hoop drawn around
 * an empty centre.
 */
function placeProjects({ projects, footprints, verdicts, shared, families, box }) {
  const angleOf = new Map(shared.map((entry, at) => [key(entry), ring(at, shared.length)]));
  const familyOf = new Map();
  for (const family of families) {
    for (const member of family.members) familyOf.set(member, family.path);
  }

  const wantOf = (project) => {
    const angles = shared
      .filter((entry) => entry.projects.includes(project.path))
      .map((entry) => angleOf.get(key(entry)));
    return angles.length > 0 ? meanAngle(angles) : null;
  };

  // The ring is ordered by unit, not by project: a family is one unit and
  // arrives whole, which is the entire point of knowing it is a family.
  const units = new Map();
  for (const project of projects) {
    const id = familyOf.get(project.path) ?? project.path;
    const unit = units.get(id) ?? { id, members: [], wants: [] };
    unit.members.push(project);
    const want = wantOf(project);
    if (want !== null) unit.wants.push(want);
    units.set(id, unit);
  }

  const placed = [...units.values()].map((unit) => ({
    ...unit,
    want: unit.wants.length > 0 ? meanAngle(unit.wants) : null,
  }));

  // A unit carrying nothing shared has no opinion, and giving all of them the
  // same non-opinion piles them into one arc while the rest of the ring stays
  // empty. They are spread across it instead, so they fall between the
  // clusters rather than all beside each other.
  const opinionless = placed.filter((unit) => unit.want === null);
  opinionless.forEach((unit, at) => {
    unit.want = ring(at, opinionless.length) + Math.PI / Math.max(1, opinionless.length);
  });

  const order = placed
    .sort((left, right) => left.want - right.want || left.id.localeCompare(right.id))
    .flatMap((unit) => unit.members);

  const rows = shared.length > 0 ? 2 : 3;
  const rank = new Map(order.map((project, at) => [project.path, at]));

  return projects.map((project) => {
    const footprint = footprints[project.path] ?? null;
    const at = rank.get(project.path);
    const angle = ring(at, projects.length);
    const row = projects.length > rows ? at % rows : 0;

    return {
      id: `project:${project.path}`,
      kind: "project",
      path: project.path,
      label: project.name,
      detail: project.kind,
      verdict: verdicts[project.path] ?? "unknown",
      family: familyOf.get(project.path) ?? null,
      bytes: footprint?.totalBytes ?? 0,
      // An unmeasured project is not a project of no size. It draws at the
      // floor and says so, rather than appearing as the smallest thing here.
      weight: footprint?.totalBytes ?? null,
      angle,
      ...polar(angle, 1 - row * (rows === 3 ? 0.26 : 0.15), box),
    };
  });
}

function copyEdges(shared, projects) {
  const known = new Set(projects.map((project) => project.path));
  return shared.flatMap((entry) =>
    entry.projects
      .filter((path) => known.has(path))
      .map((path) => ({
        id: `copy:${key(entry)}:${path}`,
        kind: "copy",
        from: `package:${key(entry)}`,
        to: `project:${path}`,
      })),
  );
}

/**
 * Clones of one repository, drawn once rather than once per direction.
 *
 * `duplicateOf` is symmetric — each side names the other — so the pair is
 * sorted and de-duplicated, or every clone would be drawn twice on top of
 * itself and read as a heavier line.
 */
function cloneEdges(projects) {
  const known = new Set(projects.map((project) => project.path));
  const seen = new Set();
  const edges = [];

  for (const project of projects) {
    for (const other of project.duplicateOf ?? []) {
      if (!known.has(other)) continue;
      const pair = [project.path, other].sort();
      const id = `clone:${pair[0]}:${pair[1]}`;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.push({ id, kind: "clone", from: `project:${pair[0]}`, to: `project:${pair[1]}` });
    }
  }

  return edges;
}

/**
 * A family as a chain through its members rather than a line between every
 * pair. The members are already adjacent, so the chain is short hops that read
 * as one shape; a clique of the same four projects is six crossing lines
 * saying the same thing once each.
 */
function familyEdges(families, placed) {
  const at = new Map(placed.map((node) => [node.path, node]));

  return families.flatMap((family) => {
    const members = family.members
      .map((path) => at.get(path))
      .filter(Boolean)
      .sort((left, right) => left.angle - right.angle);

    return members.slice(1).map((node, index) => ({
      id: `family:${family.path}:${index}`,
      kind: "family",
      from: `project:${members[index].path}`,
      to: `project:${node.path}`,
    }));
  });
}

/** The family's name, once, at the middle of what it holds. */
function familyLabels(families, placed) {
  const at = new Map(placed.map((node) => [node.path, node]));

  return families
    .map((family) => {
      const members = family.members.map((path) => at.get(path)).filter(Boolean);
      if (members.length < 2) return null;
      return {
        id: `family:${family.path}`,
        text: family.name,
        detail: family.declaredBy ? `${family.declaredBy} workspace` : "one folder",
        declared: Boolean(family.declaredBy),
        x: members.reduce((total, node) => total + node.x, 0) / members.length,
        y: members.reduce((total, node) => total + node.y, 0) / members.length,
      };
    })
    .filter(Boolean);
}

function key(entry) {
  return `${entry.name}@${entry.version}`;
}

/** Position `at` of `count`, clockwise from the top. */
function ring(at, count) {
  if (count <= 0) return 0;
  return (at / count) * Math.PI * 2 - Math.PI / 2;
}

/**
 * The average of angles, taken on the circle rather than on the numbers.
 *
 * Averaging 350° and 10° arithmetically gives 180° — the opposite side of the
 * ring from both — so a project carrying one package either side of the top
 * would be flung to the bottom.
 */
function meanAngle(angles) {
  const x = angles.reduce((total, angle) => total + Math.cos(angle), 0);
  const y = angles.reduce((total, angle) => total + Math.sin(angle), 0);
  if (x === 0 && y === 0) return angles[0];
  return Math.atan2(y, x);
}

/**
 * A point on an ellipse inscribed in the box, at `scale` of its full size.
 *
 * Elliptical rather than circular so a wide window is used rather than framed
 * with empty margins, and capped so a very wide one does not flatten the ring
 * into a horizon.
 */
function polar(angle, scale, box) {
  const ry = (box.height / 2) * (1 - MARGIN * 2);
  const rx = Math.min((box.width / 2) * (1 - MARGIN * 2), ry * MAX_STRETCH);

  return {
    x: box.width / 2 + Math.cos(angle) * rx * scale,
    y: box.height / 2 + Math.sin(angle) * ry * scale,
  };
}

/** The closest any two nodes come to each other. */
function separation(nodes) {
  let closest = Infinity;
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      closest = Math.min(closest, Math.hypot(nodes[left].x - nodes[right].x, nodes[left].y - nodes[right].y));
    }
  }
  return closest === Infinity ? 0.11 : closest;
}

/**
 * Node radius from what it weighs, bounded by what the layout left room for.
 *
 * Area is proportional to the weight, not the radius: doubling a radius
 * quadruples the ink, and a picture that overstates its heaviest node by that
 * much is not a measurement.
 */
export function nodeRadius(weight, heaviest, ceiling) {
  const max = Math.min(0.055, ceiling);
  const min = Math.min(0.014, max);
  if (!weight || !heaviest || heaviest <= 0) return min;
  return min + (max - min) * Math.sqrt(Math.min(weight, heaviest) / heaviest);
}
