// Which projects a maintenance policy is allowed to touch.
//
// This is the code that would authorise deleting something nobody watched being
// deleted, so it is written to refuse rather than to include. Three rules from
// WORKSPACE_REDESIGN sections 4 and 14 are structural here, not configurable:
//
//   - only the `safe` verdict is eligible. `protect` holds work that exists
//     nowhere else, and `unknown` means the core could not read enough to
//     judge — both stop automation rather than falling through to a default;
//   - a project has to have been quiet for the configured age. Freshly built
//     output belongs to work in progress;
//   - nothing is selected without a measurement. A project whose footprint has
//     not arrived yet is not "zero bytes", it is unknown.
//
// The policy chooses projects. It never chooses paths: what is removed inside a
// selected project is still decided by the providers, and cleanup still
// re-validates every target before touching it.

/** Verdicts a policy may ever act on. Not a setting. */
export const ELIGIBLE_VERDICTS = ["safe"];

export const DEFAULT_POLICY = {
  enabled: false,
  /** Days a project must have been idle before it is eligible. */
  minIdleDays: 90,
  /** Skip anything below this, so a run is never noise. */
  minBytes: 500 * 1024 * 1024,
  /** Trash, always, until an explicit opt-in exists for anything else. */
  mode: "Trash",
};

/**
 * Why a project was not selected, in the order the rules are applied.
 *
 * Returned rather than discarded because a policy that quietly matches nothing
 * is indistinguishable from a broken one, and the screen has to be able to say
 * which rule did the excluding.
 */
export function evaluateProject({ project, verdict, footprint, policy }) {
  if (!ELIGIBLE_VERDICTS.includes(verdict)) {
    return { eligible: false, reason: "verdict", verdict };
  }
  if (!footprint) {
    return { eligible: false, reason: "unmeasured" };
  }
  const idleDays = project.activity?.idleDays ?? null;
  if (idleDays === null) {
    return { eligible: false, reason: "unknownActivity" };
  }
  if (idleDays < policy.minIdleDays) {
    return { eligible: false, reason: "tooRecent", idleDays };
  }
  if (footprint.reclaimableBytes < policy.minBytes) {
    return { eligible: false, reason: "tooSmall", bytes: footprint.reclaimableBytes };
  }
  return { eligible: true, bytes: footprint.reclaimableBytes, idleDays };
}

/**
 * What this policy would do right now.
 *
 * Nothing is deleted here and nothing is scheduled. The point of a preview is
 * that the user sees the selection before granting it a schedule, which is the
 * order the roadmap requires: preview first, automation second.
 */
export function previewPolicy({ projects, verdicts, footprints, policy }) {
  const selected = [];
  const skipped = [];

  for (const project of projects) {
    const outcome = evaluateProject({
      project,
      verdict: verdicts[project.path] ?? "unknown",
      footprint: footprints[project.path] ?? null,
      policy,
    });
    if (outcome.eligible) {
      selected.push({ project, bytes: outcome.bytes, idleDays: outcome.idleDays });
    } else {
      skipped.push({ project, ...outcome });
    }
  }

  selected.sort((left, right) => right.bytes - left.bytes);

  return {
    selected,
    skipped,
    bytes: selected.reduce((total, entry) => total + entry.bytes, 0),
    // Counted separately because it is the one exclusion that is a finding in
    // itself: a policy is silently doing nothing while work sits unprotected.
    protectedCount: skipped.filter((entry) => entry.verdict === "protect").length,
  };
}
