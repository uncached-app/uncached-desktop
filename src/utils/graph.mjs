/**
 * The workspace as a graph, positioned.
 *
 * Two kinds of node and two kinds of edge, and the choice of which is the whole
 * point. A canvas of project nodes joined by folder membership draws what the
 * sidebar already says. What it cannot say is that one package sits in eleven
 * projects at once — so the shared packages are nodes too, and the edges are
 * "this project carries a copy of that". That is the sentence the picture
 * exists to make: the duplication has a shape, and the shape has a middle.
 *
 * Positions are computed, never simulated. A force layout settles somewhere
 * slightly different every run, which destroys the one thing a map is for —
 * that a project stays where you last saw it. Here the same workspace always
 * produces the same picture, so stability costs no stored file and there is
 * nothing to migrate later.
 */

/** Above this the picture stops being one, and the list is the honest answer. */
export const MAX_NODES = 150;

/** Shared packages worth drawing. The tail is a list, not a shape. */
export const MAX_PACKAGES = 12;

const INNER_RADIUS = 0.34;
const OUTER_RADIUS = 0.82;
/** The outer ring is two rows, so neighbours have somewhere to be. */
const STAGGER = 0.11;

/**
 * Builds the graph in a unit square: every x and y is 0..1, every radius is a
 * fraction of the shorter side. The component scales it, so the same graph
 * draws at any window size and nothing here knows about pixels.
 */
export function workspaceGraph({ projects, footprints, verdicts, packages, limit = MAX_PACKAGES }) {
  const shared = sharedPackages(packages, limit);
  const carried = new Set(shared.flatMap((entry) => entry.projects));

  const nodes = [
    ...packageNodes(shared),
    ...projectNodes(projects, footprints, verdicts, shared, carried),
  ];

  return {
    nodes,
    edges: [...copyEdges(shared, projects), ...cloneEdges(projects)],
    /** Packages left out of the picture because it only holds so many. */
    packagesOmitted: Math.max(0, countable(packages).length - shared.length),
    tooLarge: projects.length + shared.length > MAX_NODES,
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
 * The shared packages on an inner ring, heaviest first, going clockwise from
 * the top. Their angle is what every project's angle is derived from, so this
 * ordering decides the whole picture and has to be a total order — hence the
 * name as the tiebreaker on equal weight.
 */
function packageNodes(shared) {
  return shared.map((entry, at) => {
    const angle = ring(at, shared.length);
    return {
      id: `package:${entry.name}@${entry.version}`,
      kind: "package",
      label: entry.name,
      detail: `${entry.copies} copies`,
      bytes: entry.wastedBytes,
      weight: entry.wastedBytes,
      angle,
      ...polar(angle, shared.length === 1 ? 0 : INNER_RADIUS),
    };
  });
}

/**
 * Every project on the outer ring, ordered by the packages it carries.
 *
 * Each project wants the average angle of its shared packages, so projects
 * holding the same ones want the same place. Wanting is not getting: eleven
 * projects that all carry React want one identical point, and drawing them
 * there is one circle with ten hidden behind it. So the wanted angle decides
 * the *order* around the ring, and the ring itself is divided evenly — which
 * keeps neighbours meaningful and keeps every node visible, the two things a
 * force layout spends a simulation arriving at.
 *
 * A project carrying nothing shared wants a spot in the free arc, so those fall
 * between the clusters rather than into them.
 *
 * The ring is two rows deep, alternating. A single row of eighty nodes has
 * nowhere to put them; two rows halve the crowding without a second ring
 * having to mean anything.
 */
function projectNodes(projects, footprints, verdicts, shared, carried) {
  const angleOf = new Map(shared.map((entry, at) => [key(entry), ring(at, shared.length)]));
  const unattached = projects.filter((project) => !carried.has(project.path));

  let free = 0;
  const wanted = projects.map((project) => {
    const angles = shared
      .filter((entry) => entry.projects.includes(project.path))
      .map((entry) => angleOf.get(key(entry)));
    return {
      project,
      want:
        angles.length > 0
          ? meanAngle(angles)
          : ring(free++, unattached.length) + Math.PI / Math.max(1, unattached.length),
    };
  });

  const order = [...wanted].sort(
    (left, right) => left.want - right.want || left.project.path.localeCompare(right.project.path),
  );
  const rank = new Map(order.map((entry, at) => [entry.project.path, at]));

  return wanted.map(({ project }) => {
    const footprint = footprints[project.path] ?? null;
    const at = rank.get(project.path);
    const angle = ring(at, projects.length);
    const radius = OUTER_RADIUS - (at % 2 === 0 ? 0 : STAGGER);

    return {
      id: `project:${project.path}`,
      kind: "project",
      path: project.path,
      label: project.name,
      detail: project.kind,
      verdict: verdicts[project.path] ?? "unknown",
      bytes: footprint?.totalBytes ?? 0,
      // An unmeasured project is not a project of no size. It draws at the
      // floor and says so, rather than appearing as the smallest thing here.
      weight: footprint?.totalBytes ?? null,
      angle,
      ...polar(angle, radius),
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

function polar(angle, radius) {
  return {
    x: 0.5 + (Math.cos(angle) * radius) / 2,
    y: 0.5 + (Math.sin(angle) * radius) / 2,
  };
}

/**
 * Node radius from what it weighs, as a fraction of the shorter side.
 *
 * Area is proportional to the weight, not the radius: doubling a radius
 * quadruples the ink, and a picture that overstates its heaviest node by that
 * much is not a measurement.
 */
export function nodeRadius(weight, heaviest, { min = 0.012, max = 0.055 } = {}) {
  if (!weight || !heaviest || heaviest <= 0) return min;
  return min + (max - min) * Math.sqrt(Math.min(weight, heaviest) / heaviest);
}

/**
 * How large the heaviest node on a ring may draw before neighbours touch.
 *
 * A fixed ceiling is right for eight projects and wrong for eighty: the arc
 * each one gets shrinks with the count, and a node wider than its arc overlaps
 * whatever is beside it however carefully it was placed. Forty small circles
 * are a legible ring; forty overlapping ones are a smear that also hides which
 * is heaviest — so when something has to give, it is the size channel.
 *
 * Measured rather than estimated, because the two neighbours are at different
 * distances. On a staggered ring the next node along is one step round and one
 * row in, while the one after it is two steps round and in the same row; which
 * of those is the tighter fit changes with the count, so both are computed.
 */
export function ringCeiling({ ring, count, stagger = 0, max = 0.055, min = 0.006 }) {
  if (count <= 1) return max;
  const radius = ring / 2;
  const step = (Math.PI * 2) / count;
  const inner = radius - stagger / 2;

  // Chord to the node one step along, which sits on the other row.
  const adjacent = Math.hypot(
    radius - inner * Math.cos(step),
    inner * Math.sin(step),
  );
  // And to the one two steps along, back on this row — measured on the inner
  // row, which is the shorter of the two and therefore the one that decides.
  const sameRow = 2 * inner * Math.sin(step);

  // An odd ring cannot alternate all the way round: somewhere the last node
  // meets the first on the same row, one step apart instead of two. That seam
  // is the tightest fit on the ring, and forgetting it is a pair of circles
  // drawn through each other exactly once, at the top, every time.
  const seam =
    stagger > 0 && count % 2 === 1 ? 2 * radius * Math.sin(step / 2) : Infinity;

  return Math.min(
    max,
    Math.max(min, Math.min(adjacent, seam, count > 2 ? sameRow : Infinity) / 2),
  );
}

/** The outer ring, which is where projects are. */
export function projectRadiusCeiling(count, bounds = {}) {
  return ringCeiling({ ring: OUTER_RADIUS, count, stagger: STAGGER, ...bounds });
}

/** The inner ring, which holds at most `MAX_PACKAGES` and is not staggered. */
export function packageRadiusCeiling(count, bounds = {}) {
  return ringCeiling({ ring: INNER_RADIUS, count, ...bounds });
}
