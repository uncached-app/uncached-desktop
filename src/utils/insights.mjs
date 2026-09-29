// Sentences about the workspace, derived from what the core already measured.
//
// The rules come from WORKSPACE_REDESIGN section 7, and they are what keeps this
// from becoming noise:
//
//   - every sentence carries a real, measured number;
//   - every sentence leads somewhere — a filter or a project. A sentence with no
//     destination is decoration;
//   - no sentence uses fear or false urgency;
//   - when there is nothing worth saying, the app says so calmly instead of
//     inventing content.
//
// Kept as a pure function over data so the wording is testable without a
// filesystem, a window or a plan.

/** Below this, a sentence is technically true and not worth a line. */
const MIN_BYTES = 100 * 1024 * 1024;

/** A project has to be quiet for this long before it is worth mentioning. */
const COLD_DAYS = 90;

/** How dominant one artifact kind must be before naming it says anything. */
const CONCENTRATION = 0.6;

/** `key` is an i18n key; plural messages carry `count` in `params`. */
function message(finding, params) {
  return { key: `insights.highlights.findings.${finding}`, params };
}

function sumReclaimable(paths, footprints) {
  return paths.reduce((total, path) => total + (footprints[path]?.reclaimableBytes ?? 0), 0);
}

/**
 * What a plan without measurements sees in place of one.
 *
 * Free reaches this screen and reads every sentence: which projects are cold,
 * which are copies, which drifted from their lockfile. What it does not get is
 * how much is at stake, because that quantification is the module being sold.
 *
 * The sentence about work that exists only on this disk is unaffected, and that
 * is deliberate rather than incidental — it carries no byte count at all, so
 * there is nothing in it to withhold. Warning someone they are about to lose
 * work is never a paid feature.
 */
export const REDACTED = "\u2022\u2022\u2022";

/**
 * Builds the list, heaviest first.
 *
 * `formatBytes` is injected rather than imported so this module stays free of
 * presentation, so a test can assert on plain numbers, and so a plan without
 * access to the measurements can pass a redacting one.
 *
 * The desktop passes the real formatter on every plan. These sentences read a
 * scan that is already on screen, and the byte counts in them are one row away
 * in the workspace list \u2014 withholding a number the user can reach by scrolling
 * is friction rather than a boundary. What Pro sells on this screen is the
 * history beneath them: the scan is the present, and only Pro keeps the past.
 */
export function buildInsights({ projects, footprints, verdicts, totals, formatBytes }) {
  const insights = [];
  const verdictOf = (project) => verdicts[project.path] ?? "unknown";

  // Cold and heavy. The pair is the point: neither idleness nor size alone is
  // a reason to look, and together they are the clearest reclaim there is.
  const cold = projects.filter(
    (project) =>
      (project.activity?.idleDays ?? 0) >= COLD_DAYS &&
      (footprints[project.path]?.reclaimableBytes ?? 0) > 0,
  );
  const coldBytes = sumReclaimable(
    cold.map((project) => project.path),
    footprints,
  );
  if (cold.length > 0 && coldBytes >= MIN_BYTES) {
    insights.push({
      id: "cold",
      bytes: coldBytes,
      message: message("cold", { count: cold.length, days: COLD_DAYS, size: formatBytes(coldBytes) }),
      action: { kind: "verdict", verdict: "safe" },
    });
  }

  // The single heaviest project, named. A total tells you the size of the
  // problem; a name tells you where it is.
  const heaviest = [...projects].sort(
    (left, right) =>
      (footprints[right.path]?.reclaimableBytes ?? 0) - (footprints[left.path]?.reclaimableBytes ?? 0),
  )[0];
  const heaviestBytes = heaviest ? (footprints[heaviest.path]?.reclaimableBytes ?? 0) : 0;
  if (heaviest && heaviestBytes >= MIN_BYTES) {
    insights.push({
      id: "heaviest",
      bytes: heaviestBytes,
      message: message("heaviest", { name: heaviest.name, size: formatBytes(heaviestBytes) }),
      action: { kind: "project", path: heaviest.path },
    });
  }

  // What the disk is actually full of. Only worth a line when one kind
  // dominates: an even spread across five ecosystems is not a finding.
  const byCategory = new Map();
  for (const project of projects) {
    for (const entry of footprints[project.path]?.byCategory ?? []) {
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.bytes);
    }
  }
  const totalCategorised = [...byCategory.values()].reduce((sum, bytes) => sum + bytes, 0);
  const [topCategory, topBytes] = [...byCategory.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
  if (topCategory && totalCategorised > 0 && topBytes / totalCategorised >= CONCENTRATION && topBytes >= MIN_BYTES) {
    insights.push({
      id: "concentration",
      bytes: topBytes,
      message: message("concentration", {
        percent: Math.round((topBytes / totalCategorised) * 100),
        category: topCategory,
        size: formatBytes(topBytes),
      }),
      action: { kind: "category", category: topCategory },
    });
  }

  // Copies of one repository. Counted by remote, which the core already
  // resolved — matching on directory names would find rewrites, not clones.
  const duplicated = projects.filter((project) => (project.duplicateOf?.length ?? 0) > 0);
  if (duplicated.length > 0) {
    const duplicateBytes = sumReclaimable(
      duplicated.map((project) => project.path),
      footprints,
    );
    insights.push({
      id: "duplicates",
      bytes: duplicateBytes,
      message: message("duplicates", { count: duplicated.length }),
      action: { kind: "duplicates" },
    });
  }

  // A lockfile newer than the install. Not a cleanup — the installed tree is
  // already wrong, and reinstalling is the fix.
  const stale = projects.filter((project) => verdictOf(project) === "staleDeps");
  if (stale.length > 0) {
    insights.push({
      id: "stale",
      bytes: sumReclaimable(stale.map((project) => project.path), footprints),
      message: message("stale", { count: stale.length }),
      action: { kind: "verdict", verdict: "staleDeps" },
    });
  }

  // Stated flatly and never sorted to the top by size. This is the one place a
  // number would be the wrong emphasis: the point is that the work exists
  // nowhere else, not how many bytes it occupies.
  const atRisk = projects.filter((project) => verdictOf(project) === "protect");
  if (atRisk.length > 0) {
    insights.push({
      id: "protect",
      bytes: 0,
      pinned: true,
      message: message("protect", { count: atRisk.length }),
      action: { kind: "verdict", verdict: "protect" },
    });
  }

  const sorted = insights.sort((left, right) => right.bytes - left.bytes);
  const pinned = sorted.filter((insight) => insight.pinned);
  const rest = sorted.filter((insight) => !insight.pinned);

  // What has already been reclaimed closes the list rather than opening it: it
  // is the only line that reports the past, and it has no destination.
  const history = [];
  if (totals?.allTimeBytes > 0) {
    history.push({
      id: "reclaimed",
      bytes: 0,
      message: message("reclaimed", { count: totals.cleanups, size: formatBytes(totals.allTimeBytes) }),
    });
  }

  return [...pinned, ...rest, ...history];
}
