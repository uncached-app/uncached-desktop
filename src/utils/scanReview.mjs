import { isFreeTarget } from "./entitlements.mjs";

export function canOpenReview(scanFinished, targetCount, targets) {
  return (
    scanFinished &&
    targetCount !== null &&
    targets.length >= targetCount &&
    targets.every((target) => !target.sizePending)
  );
}

export function shouldOpenReview(step, scanFinished, targetCount, targets) {
  return step === 2 && canOpenReview(scanFinished, targetCount, targets);
}

/**
 * The targets a reclaim could actually take.
 *
 * `cleanable === false` is a catalogued location the product reports and never
 * removes; a pending or failed size is refused by `claim_target_for_cleanup`.
 * They are excluded here rather than only in the card, so they stay out of
 * Select all, out of the delete count and out of the reclaimable total — every
 * number that would otherwise promise an operation the backend refuses.
 *
 * **Mirrors `ScanTarget::cleanup_ready` in
 * `src-tauri/src/models/target.rs`, condition for condition.** That is the
 * definition; this exists because the interface has to answer the same question
 * before a click and cannot call it. Two of its three inputs change after a
 * target is registered, so the answer cannot be stamped on the wire and read —
 * it has to be asked again here.
 *
 * A fourth condition added there has to be added here. Both sides are tested,
 * and both test names point at the other file.
 */
export function getCleanupReadyTargets(targets) {
  return targets.filter(
    (target) => target.cleanable && !target.sizePending && !target.sizeHasErrors,
  );
}

// Review first, then medium, then high. A target the core is unsure about is
// the one worth a human's attention, so it must not be buried under the
// routine ones. An unrecognized level sorts first for the same reason.
const CONFIDENCE_ORDER = { review: 0, medium: 1, high: 2 };

// On Free, targets the plan cannot clean sink below the ones it can. A list
// that opens on rows the user is not allowed to act on reads as a paywall
// wearing a scan. Within each group the confidence order still applies.
export function sortForListing(targets, proEnabled) {
  return [...targets].sort((left, right) => {
    if (!proEnabled) {
      const byPlan = planRank(left) - planRank(right);
      if (byPlan !== 0) return byPlan;
    }
    return confidenceRank(left) - confidenceRank(right);
  });
}

function planRank(target) {
  return isFreeTarget(target) ? 0 : 1;
}

function confidenceRank(target) {
  const level = target.confidence?.level;
  return CONFIDENCE_ORDER[level] ?? 0;
}
