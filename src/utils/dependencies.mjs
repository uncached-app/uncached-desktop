const LEVEL_ORDER = { high: 0, medium: 1, review: 2 };

/**
 * The projects and manifests with something to show at `scope`: `"high"` keeps
 * only high-confidence findings, `"all"` keeps every level. Empty manifests and
 * projects are dropped. Projects with the most findings come first; within a
 * manifest, the surest findings first, then by name.
 */
export function visibleDependencies(projects, scope) {
  const shown = (dependency) => scope === "all" || dependency.confidence === "high";
  return projects
    .map((project) => ({
      ...project,
      reports: project.reports
        .map((report) => ({ ...report, unused: report.unused.filter(shown).sort(byLevelThenName) }))
        .filter((report) => report.unused.length > 0),
    }))
    .filter((project) => project.reports.length > 0)
    .sort((a, b) => countUnused(b) - countUnused(a) || a.project.localeCompare(b.project));
}

function byLevelThenName(a, b) {
  return LEVEL_ORDER[a.confidence] - LEVEL_ORDER[b.confidence] || a.name.localeCompare(b.name);
}

function countUnused(project) {
  return project.reports.reduce((sum, report) => sum + report.unused.length, 0);
}

/**
 * `manifest` relative to `project`, with `/` separators, for display. A
 * manifest outside the project is returned whole.
 */
export function relativeManifest(project, manifest) {
  const normalise = (path) => path.replace(/\\/g, "/").replace(/\/+$/, "");
  const root = normalise(project);
  const file = normalise(manifest);
  return file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file;
}
