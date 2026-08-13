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

export function getCleanupReadyTargets(targets) {
  return targets.filter((target) => !target.sizePending && !target.sizeHasErrors);
}

// Review first, then medium, then high. A target the core is unsure about is
// the one worth a human's attention, so it must not be buried under the
// routine ones. An unrecognized level sorts first for the same reason.
const CONFIDENCE_ORDER = { review: 0, medium: 1, high: 2 };

export function sortByConfidence(targets) {
  return [...targets].sort(
    (left, right) => confidenceRank(left) - confidenceRank(right),
  );
}

function confidenceRank(target) {
  const level = target.confidence?.level;
  return CONFIDENCE_ORDER[level] ?? 0;
}
