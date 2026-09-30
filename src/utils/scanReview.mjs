import { isFreeTarget } from "./entitlements.mjs";
import { isOlderThan } from "./format.mjs";

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
/**
 * True once a measurement has settled at exactly zero bytes. A pending or
 * failed size is not zero yet, so it stays visible until it resolves.
 */
export function holdsNothing(target) {
  return !target.sizePending && !target.sizeHasErrors && target.sizeBytes === 0;
}

export function getCleanupReadyTargets(targets) {
  return targets.filter(
    (target) =>
      target.cleanable &&
      // The tool that owns it is running. It is still reported and still
      // weighed — the totals above the list are honest about it — but nothing
      // that offers a removal may include it, because the backend refuses it.
      !target.blockedBy &&
      !target.sizePending &&
      !target.sizeHasErrors &&
      target.sizeBytes > 0,
  );
}

// Review first, then medium, then high. A target the core is unsure about is
// the one worth a human's attention, so it must not be buried under the
// routine ones. An unrecognized level sorts first for the same reason.
const CONFIDENCE_ORDER = { review: 0, medium: 1, high: 2 };

/**
 * Orders the listing, one of two ways.
 *
 * `confidence` is the default and the product's opinion: a target the core is
 * unsure about is the one worth a human's attention, and it must not sit below
 * forty routine ones.
 *
 * `size` is the other reading, and it was unreachable. Confidence decided the
 * order outright, so the largest directory on the machine could be anywhere in
 * the list — the same defect the project map had before it could be ranked by
 * weight, on the screen where reclaiming actually happens.
 *
 * On Free the plan still wins over both. A list that opens on rows the user is
 * not allowed to act on reads as a paywall wearing a scan.
 *
 * And what cannot be removed is not listed. The catalogue reports two
 * directories it will never touch — Xcode's archives, which hold the symbols
 * that decode crashes from a release already in users' hands, and the simulator
 * store, which holds whatever was installed inside it. Reporting them was meant
 * to keep the total honest. In a list whose whole purpose is reclaiming, a row
 * with the control taken out reads as a feature that stopped halfway, and it
 * read that way hardest at six kilobytes, where the honest total is not worth
 * anything. They remain in the scan, so nothing that counts them is now
 * counting less; they are simply not offered as work.
 */
/**
 * Locations the product reports and never removes, heaviest first.
 * Zero-byte and unsettled measurements are left out.
 */
export function listReportedOnly(targets) {
  return targets
    .filter((target) => target.cleanable === false && !target.sizePending && target.sizeBytes > 0)
    .sort((left, right) => right.sizeBytes - left.sizeBytes);
}

/**
 * Narrows a listing to what nothing has written to in `days`.
 *
 * `0` means every age. A target whose size is still being measured has no age
 * yet and is kept: it would otherwise vanish from the list mid-scan and come
 * back when its size settled.
 */
export function filterByAge(targets, days, now = Date.now()) {
  if (!days) return targets;
  return targets.filter(
    (target) => target.sizePending || isOlderThan(target.lastUsedAt, days, now),
  );
}

/** `ids` itself when every one is in `available`, so a state setter can bail out. */
export function keepAvailableIds(ids, available) {
  const kept = [...ids].filter((id) => available.has(id));
  return kept.length === ids.size ? ids : new Set(kept);
}

/** `targets` itself when every one is in `available`, so a state setter can bail out. */
export function keepAvailableTargets(targets, available) {
  const kept = targets.filter((target) => available.has(target.id));
  return kept.length === targets.length ? targets : kept;
}

export function sortForListing(targets, proEnabled, order = "confidence") {
  return [...targets].filter((target) => target.cleanable !== false).sort((left, right) => {
    if (!proEnabled) {
      const byPlan = planRank(left) - planRank(right);
      if (byPlan !== 0) return byPlan;
    }
    if (order === "size") {
      const bySize = (right.sizeBytes ?? 0) - (left.sizeBytes ?? 0);
      if (bySize !== 0) return bySize;
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
