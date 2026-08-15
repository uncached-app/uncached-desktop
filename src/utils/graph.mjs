/**
 * The workspace as a graph, positioned.
 *
 * Three kinds of relationship, and the choice of which is the whole point. A
 * canvas of project nodes joined by folder membership draws what the sidebar
 * already says. What it cannot say is what is *shared*: one package sitting in
 * eleven projects at once, one repository checked out twice, and four folders
 * under one directory that are a single piece of work. So packages are nodes
 * too, families are clusters, and clones are chords.
 *
 * The picture grows rather than tightening. An earlier version divided one ring
 * evenly among however many projects there were, which meant a workspace twice
 * the size drew every node half as far apart and half as large, until at a
 * hundred and forty it gave up and said so. It gave up because it could not be
 * navigated; it can be now, so it packs at a constant node size onto as many
 * rings as it takes and the view is what moves. There is no size at which this
 * refuses — only sizes that want zooming.
 *
 * Positions are computed, never simulated. A force layout settles somewhere
 * slightly different every run, which destroys the one thing a map is for —
 * that a project stays where you last saw it.
 *
 * Layout happens in node units, where a node has radius 1 and nothing knows how
 * big the window is. The last step scales that to the box it is drawn into, so
 * the same workspace is the same picture at any size of window.
 */

/** Shared packages worth drawing. The tail is a list, not a shape. */
export const MAX_PACKAGES = 12;

/** Between one unit and the next, in node radii. Room for a name under each. */
const GAP = 5.4;

/**
 * A node's radius, as a fraction of the drawing box's height.
 *
 * Constant, and that is the decision. Scaling the finished layout to fit the
 * window is the obvious move and the wrong one: it means a workspace of a
 * hundred and forty draws in the same rectangle as one of twelve, with every
 * node and every gap shrunk to a tenth — a ball of dots with the names on top
 * of each other, which is exactly what fitting was supposed to avoid. A node is
 * this big whatever the workspace holds; a large one simply extends past the
 * frame, and the view is what goes to it.
 */
const NODE = 0.03;

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

  const middle = placePackages(shared);
  const units = buildUnits({ projects, shared, families });
  const outer = packUnits(units, discRadius(middle) + GAP);

  // Weights and verdicts join last: they decide how big a node draws and what
  // colour it is, and neither changes where it goes.
  const nodes = dress(intoBox([...middle, ...outer.nodes], box), footprints, verdicts);

  return {
    nodes,
    edges: [
      ...copyEdges(shared, projects),
      ...cloneEdges(projects),
      ...familyEdges(families, nodes),
    ],
    /** One label per family, under the cluster it names. */
    labels: familyLabels(families, nodes),
    /** Packages left out of the picture because it only holds so many. */
    packagesOmitted: Math.max(0, countable(packages).length - shared.length),
    /** Nothing is installed in more than one project, so there is no middle. */
    sharesNothing: shared.length === 0,
    /**
     * The largest any node may draw before two of them touch — measured from
     * the positions rather than derived from the layout, because the layout is
     * the thing that changes and the arithmetic for each variant of it was
     * wrong twice before this replaced it.
     */
    // Capped at the size the layout was packed for. Half the closest approach
    // is what fits, and what fits is far bigger than what reads: at ring
    // spacing the nodes would swell until the gaps between them disappeared,
    // which is the crowding the spacing existed to prevent.
    maxRadius: Math.min(separation(nodes) / 2, NODE * 1.15),
    width: box.width,
    height: box.height,
    /**
     * What the whole drawing spans, which is larger than the box as soon as the
     * workspace is. The view fits itself to this; the layout is never squeezed
     * into the frame.
     */
    extent: spanOf(nodes, box),
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
 *
 * Their angle is what every project's angle is derived from, so this ordering
 * decides the whole picture and has to be a total order — hence the name as the
 * tiebreaker on equal weight.
 */
function placePackages(shared) {
  // Room enough that the middle reads as a middle rather than a knot. Their
  // names sit under them like everything else, and a dozen packages at touching
  // distance is a dozen names in one line.
  const radius = shared.length < 2 ? 0 : Math.max(3.5, shared.length * 1.15);

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
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
}

function discRadius(nodes) {
  return nodes.reduce((far, node) => Math.max(far, Math.hypot(node.x, node.y) + 1), 0);
}

/**
 * Projects grouped into what gets placed as one thing.
 *
 * A family is a unit. Four folders under one directory are one piece of work,
 * and a map that hands each of them a slot the same size as an unrelated
 * project has said nothing about them — the whole reason for reading the
 * directory in the first place.
 *
 * Each unit wants the average angle of the packages its members carry, so
 * carriers land near what they carry. A unit with no shared package has no
 * opinion; those are spread evenly rather than all given the same non-opinion,
 * which piles them into one arc and leaves the rest of the ring empty.
 */
function buildUnits({ projects, shared, families }) {
  const angleOf = new Map(shared.map((entry, at) => [key(entry), ring(at, shared.length)]));
  const familyOf = new Map();
  for (const family of families) {
    for (const member of family.members) familyOf.set(member, family.path);
  }

  const grouped = new Map();
  for (const project of projects) {
    const id = familyOf.get(project.path) ?? project.path;
    const unit = grouped.get(id) ?? { id, family: familyOf.get(project.path) ?? null, members: [], wants: [] };
    unit.members.push(project);
    const wants = shared
      .filter((entry) => entry.projects.includes(project.path))
      .map((entry) => angleOf.get(key(entry)));
    unit.wants.push(...wants);
    grouped.set(id, unit);
  }

  const units = [...grouped.values()].map((unit) => ({
    ...unit,
    want: unit.wants.length > 0 ? meanAngle(unit.wants) : null,
  }));

  const opinionless = units.filter((unit) => unit.want === null);
  opinionless.forEach((unit, at) => {
    unit.want = ring(at, opinionless.length) + Math.PI / Math.max(1, opinionless.length);
  });

  return units.sort((left, right) => left.want - right.want || left.id.localeCompare(right.id));
}

/**
 * Units packed onto as many rings as they need, at a constant node size.
 *
 * Each ring takes units until their angular widths fill it, then the next ring
 * starts further out. Widths are normalised to exactly fill the ring, so the
 * slack is shared rather than left as one gap where the last unit stopped.
 *
 * Growing outward instead of dividing one ring is what lets the picture hold a
 * workspace of any size: a node is always the same size, and reading it is a
 * matter of how close the view is.
 */
function packUnits(units, inner) {
  const sized = units.map((unit) => ({ ...unit, radius: unitRadius(unit.members.length) }));
  const rings = [];
  let current = [];
  let radius = Math.max(inner, sized[0] ? sized[0].radius + GAP : 0);
  let filled = 0;

  for (const unit of sized) {
    const width = angularWidth(unit.radius + GAP / 2, radius);
    if (current.length > 0 && filled + width > Math.PI * 2) {
      rings.push({ radius, units: current, widths: current.map((entry) => entry.width) });
      const previous = Math.max(...current.map((entry) => entry.unit.radius));
      radius += previous + unit.radius + GAP;
      current = [];
      filled = 0;
    }
    const settled = angularWidth(unit.radius + GAP / 2, radius);
    current.push({ unit, width: settled });
    filled += settled;
  }
  if (current.length > 0) rings.push({ radius, units: current, widths: current.map((entry) => entry.width) });

  const nodes = [];

  for (const line of rings) {
    const total = line.widths.reduce((sum, width) => sum + width, 0);
    // Normalised, so what is on this ring is spread across the whole of it
    // rather than crowding one side with the leftover behind them.
    const scale = total > 0 ? (Math.PI * 2) / total : 0;
    let angle = -Math.PI / 2;

    for (const { unit, width } of line.units) {
      const slot = width * scale;
      const centre = angle + slot / 2;
      angle += slot;
      const at = { x: Math.cos(centre) * line.radius, y: Math.sin(centre) * line.radius };
      nodes.push(...placeMembers(unit, at, centre));
    }
  }

  return {
    nodes,
    extent: nodes.reduce((far, node) => Math.max(far, Math.hypot(node.x, node.y) + 1), 1),
  };
}

/** Half the angle a circle of this radius takes up at this distance out. */
function angularWidth(radius, distance) {
  if (distance <= radius) return Math.PI * 2;
  return 2 * Math.asin(Math.min(1, radius / distance));
}

/**
 * Room inside a cluster, in node radii.
 *
 * `1/sin(π/k)` is the radius at which k circles of radius 1 exactly meet around
 * a centre — which is to say, touch. Touching is not enough twice over: every
 * one of them carries a name underneath, and four names written under four
 * circles that are against each other is one unreadable line; and the family's
 * own name goes in the hole they leave, which has to be a hole worth the name.
 */
const CLUSTER_SPREAD = 3.2;

/** How much room a unit needs: one node, or a cluster of them. */
function unitRadius(members) {
  if (members < 2) return 1;
  return clusterSpread(members) + 1;
}

function clusterSpread(members) {
  return (1 / Math.sin(Math.PI / members)) * CLUSTER_SPREAD;
}

/**
 * A unit's members: one node at the spot, or a small ring of them around it.
 *
 * The cluster is the answer to four projects drawn as four unrelated dots. It
 * is turned to face outward so a family on the left of the picture reads the
 * same way as one on the right.
 */
function placeMembers(unit, at, facing) {
  if (unit.members.length === 1) {
    return [nodeFor(unit.members[0], at, facing, unit)];
  }

  const spread = clusterSpread(unit.members.length);
  return unit.members.map((project, index) => {
    const angle = facing + ring(index, unit.members.length) + Math.PI / 2;
    return nodeFor(
      project,
      { x: at.x + Math.cos(angle) * spread, y: at.y + Math.sin(angle) * spread },
      facing,
      unit,
    );
  });
}

function nodeFor(project, at, angle, unit) {
  return {
    id: `project:${project.path}`,
    kind: "project",
    path: project.path,
    label: project.name,
    detail: project.kind,
    verdict: null,
    family: unit.family,
    unit: unit.id,
    angle,
    x: at.x,
    y: at.y,
    project,
  };
}

/**
 * From layout units into the box, at a fixed size rather than a fitted one.
 *
 * The centre of the drawing is the centre of the box, so an untouched view
 * opens on the middle — which is where the shared packages are, and the reason
 * anyone opened the map.
 */
function intoBox(nodes, box) {
  return nodes.map((node) => ({
    ...node,
    x: box.width / 2 + node.x * NODE,
    y: box.height / 2 + node.y * NODE,
  }));
}

/** The rectangle the drawing occupies, in box units, names included. */
function spanOf(nodes, box) {
  if (nodes.length === 0) return { x: 0, y: 0, width: box.width, height: box.height };
  const room = NODE * 2.2;
  const left = Math.min(...nodes.map((node) => node.x)) - room;
  const right = Math.max(...nodes.map((node) => node.x)) + room;
  const top = Math.min(...nodes.map((node) => node.y)) - room;
  const bottom = Math.max(...nodes.map((node) => node.y)) + room;

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The weights and verdicts, joined once the positions are settled. */
function dress(nodes, footprints, verdicts) {
  return nodes.map((node) => {
    if (node.kind !== "project") return node;
    const footprint = footprints[node.path] ?? null;
    return {
      ...node,
      verdict: verdicts[node.path] ?? "unknown",
      bytes: footprint?.totalBytes ?? 0,
      // An unmeasured project is not a project of no size. It draws at the
      // floor and says so, rather than appearing as the smallest thing here.
      weight: footprint?.totalBytes ?? null,
      project: undefined,
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
 * A family drawn round its own cluster rather than as a line between every
 * pair. The members sit on a small ring, so joining each to the next closes it
 * into a shape; a clique of the same four projects is six crossing lines saying
 * the same thing once each.
 */
function familyEdges(families, placed) {
  const at = new Map(placed.filter((node) => node.path).map((node) => [node.path, node]));

  return families.flatMap((family) => {
    const members = family.members.map((path) => at.get(path)).filter(Boolean);
    if (members.length < 2) return [];

    return members.map((node, index) => ({
      id: `family:${family.path}:${index}`,
      kind: "family",
      from: `project:${node.path}`,
      to: `project:${members[(index + 1) % members.length].path}`,
    }));
  });
}

/** The family's name, once, under the cluster it belongs to. */
function familyLabels(families, placed) {
  const at = new Map(placed.filter((node) => node.path).map((node) => [node.path, node]));

  return families
    .map((family) => {
      const members = family.members.map((path) => at.get(path)).filter(Boolean);
      if (members.length < 2) return null;
      const middle = {
        x: members.reduce((total, node) => total + node.x, 0) / members.length,
        y: members.reduce((total, node) => total + node.y, 0) / members.length,
      };
      const reach = members.reduce(
        (far, node) => Math.max(far, Math.hypot(node.x - middle.x, node.y - middle.y)),
        0,
      );
      return {
        id: `family:${family.path}`,
        text: family.name,
        detail: family.declaredBy ? `${family.declaredBy} workspace` : "one folder",
        declared: Boolean(family.declaredBy),
        members: members.length,
        // Dead centre. Members sit on a ring with a hole in it, and the hole is
        // the name's place: hung below the cluster it lands wherever that
        // cluster happens to sit, over whatever is beneath it, and reads as a
        // label for the neighbour rather than for the group.
        x: middle.x,
        y: middle.y,
        /** How far members reach from that centre, so the name can check it fits. */
        reach,
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
  const max = ceiling;
  const min = ceiling * 0.42;
  if (!weight || !heaviest || heaviest <= 0) return min;
  return min + (max - min) * Math.sqrt(Math.min(weight, heaviest) / heaviest);
}
