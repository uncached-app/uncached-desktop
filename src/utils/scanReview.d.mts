export type ReviewTargetState = {
  sizePending: boolean;
};

export function canOpenReview(
  scanFinished: boolean,
  targetCount: number | null,
  targets: ReviewTargetState[],
): boolean;
