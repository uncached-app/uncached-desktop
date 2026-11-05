const verdictOf = (verdicts, project) => verdicts[project.path] ?? "unknown";

const byReclaimableDesc = (footprints) => (left, right) =>
  (footprints[right.path]?.reclaimableBytes ?? 0) - (footprints[left.path]?.reclaimableBytes ?? 0);

/** `query` must already be trimmed and lower-cased. */
export function scopeProjects(projects, activeRoot, query) {
  return projects.filter((project) => {
    if (activeRoot && project.root !== activeRoot) return false;
    if (!query) return true;
    const haystack = `${project.name} ${project.path} ${project.kind} ${project.git.branch ?? ""}`;
    return haystack.toLowerCase().includes(query);
  });
}

/** Applies every active filter except the one named by `except`. */
export function narrowProjects(projects, filters, except) {
  const { activeVerdict, verdicts, activeCategory, footprints, clonesOnly, activePackage } = filters;
  let narrowed = projects;
  if (activeVerdict && except !== "verdict") {
    narrowed = narrowed.filter((project) => verdictOf(verdicts, project) === activeVerdict);
  }
  if (activeCategory && except !== "category") {
    narrowed = narrowed.filter((project) =>
      (footprints[project.path]?.byCategory ?? []).some((entry) => entry.category === activeCategory),
    );
  }
  if (clonesOnly && except !== "clones") {
    narrowed = narrowed.filter((project) => project.duplicateOf.length > 0);
  }
  if (activePackage) {
    const holding = new Set(activePackage.projects);
    narrowed = narrowed.filter((project) => holding.has(project.path));
  }
  return narrowed;
}

/** Projects per category, most first, ties by name. */
export function countCategories(projects, footprints) {
  const counts = new Map();
  for (const project of projects) {
    for (const entry of footprints[project.path]?.byCategory ?? []) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

/** Projects per verdict, in `order`, omitting verdicts with none. */
export function countVerdicts(projects, verdicts, order) {
  const counts = new Map();
  for (const project of projects) {
    const verdict = verdictOf(verdicts, project);
    counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
  }
  return order.filter((verdict) => counts.has(verdict)).map((verdict) => [verdict, counts.get(verdict)]);
}

/** Only projects in `projects` count; stale footprints are ignored. */
export function sumFootprints(projects, footprints) {
  return projects.reduce(
    (sum, project) => {
      const footprint = footprints[project.path];
      if (!footprint) return sum;
      return {
        totalBytes: sum.totalBytes + footprint.totalBytes,
        reclaimableBytes: sum.reclaimableBytes + footprint.reclaimableBytes,
      };
    },
    { totalBytes: 0, reclaimableBytes: 0 },
  );
}

export function countByRoot(projects) {
  const counts = new Map();
  for (const project of projects) counts.set(project.root, (counts.get(project.root) ?? 0) + 1);
  return counts;
}

/** Heaviest on disk first. */
export function rankBySize(projects, footprints) {
  return [...projects].sort(
    (left, right) => (footprints[right.path]?.totalBytes ?? 0) - (footprints[left.path]?.totalBytes ?? 0),
  );
}

/** Families narrowed to visible members, dropping any left with fewer than two. */
export function visibleFamilies(families, visible) {
  const shown = new Set(visible.map((project) => project.path));
  return families
    .map((family) => ({ ...family, members: family.members.filter((member) => shown.has(member)) }))
    .filter((family) => family.members.length > 1);
}

/**
 * Visible projects grouped by family, largest group first, plus the projects
 * in no family. Members sort by reclaimable bytes, descending.
 */
export function groupByFamily(families, visible, footprints) {
  const heaviest = byReclaimableDesc(footprints);
  const shown = new Map(visible.map((project) => [project.path, project]));
  const groups = families
    .map((family) => ({
      family,
      projects: family.members
        .map((member) => shown.get(member))
        .filter(Boolean)
        .sort(heaviest),
    }))
    .filter((group) => group.projects.length > 1)
    .sort(
      (left, right) =>
        right.projects.length - left.projects.length || left.family.name.localeCompare(right.family.name),
    );
  const grouped = new Set(groups.flatMap((group) => group.projects.map((project) => project.path)));
  const alone = visible.filter((project) => !grouped.has(project.path)).sort(heaviest);
  return { groups, alone };
}

/** Visible projects per verdict, in `order`, each sorted by reclaimable bytes. */
export function groupByVerdict(projects, verdicts, footprints, order) {
  const groups = new Map();
  for (const project of projects) {
    const verdict = verdictOf(verdicts, project);
    groups.set(verdict, [...(groups.get(verdict) ?? []), project]);
  }
  const heaviest = byReclaimableDesc(footprints);
  for (const members of groups.values()) members.sort(heaviest);
  return order.filter((verdict) => groups.has(verdict)).map((verdict) => [verdict, groups.get(verdict)]);
}
