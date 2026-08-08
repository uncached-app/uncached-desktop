export function canOpenReview(scanFinished, targetCount, targets) {
  return (
    scanFinished &&
    targetCount !== null &&
    targets.length >= targetCount &&
    targets.every((target) => !target.sizePending)
  );
}
