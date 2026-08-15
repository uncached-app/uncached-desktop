/**
 * The workspace as one picture: what is here, what it weighs, what it is made
 * of, and what state it is in.
 *
 * Every number is a sum over answers Rust already gave — the index, the
 * footprints, the verdicts. Nothing here estimates or projects. A project whose
 * footprint has not arrived is counted as a project and not as zero bytes,
 * because unmeasured is not empty, and the caller is told how many are still
 * missing so the picture can say it is incomplete.
 *
 * The arithmetic lives here rather than in the component for the same reason
 * `report.mjs` does: a total the user is asked to believe should be testable
 * without a window.
 */

/**
 * Sums the index into one portrait.
 *
 * `verdicts` may be partial while measurement is still settling; projects
 * without one are grouped under `unknown`, which is what the backend calls the
 * same state.
 */
export function workspacePortrait({ projects, footprints, verdicts }) {
  let totalBytes = 0;
  let reclaimableBytes = 0;
  let measured = 0;

  const categories = new Map();
  const byVerdict = new Map();

  for (const project of projects) {
    const verdict = verdicts[project.path] ?? "unknown";
    byVerdict.set(verdict, (byVerdict.get(verdict) ?? 0) + 1);

    const footprint = footprints[project.path];
    if (!footprint) continue;

    measured += 1;
    totalBytes += footprint.totalBytes;
    reclaimableBytes += footprint.reclaimableBytes;
    for (const entry of footprint.byCategory ?? []) {
      categories.set(entry.category, (categories.get(entry.category) ?? 0) + entry.bytes);
    }
  }

  return {
    projects: projects.length,
    measured,
    /// Projects still being weighed. The picture is partial while this is above
    /// zero, and saying so is cheaper than a total that keeps climbing.
    pending: projects.length - measured,
    totalBytes,
    reclaimableBytes,
    /** What remains once every reclaimable directory is gone. */
    sourceBytes: Math.max(0, totalBytes - reclaimableBytes),
    /** Heaviest first. */
    categories: [...categories.entries()]
      .map(([category, bytes]) => ({ category, bytes }))
      .sort((left, right) => right.bytes - left.bytes),
    /** Heaviest first, then alphabetical so the order is stable. */
    verdicts: [...byVerdict.entries()]
      .map(([verdict, count]) => ({ verdict, count }))
      .sort((left, right) => right.count - left.count || left.verdict.localeCompare(right.verdict)),
  };
}
