export type ReviewTargetState = {
  sizePending: boolean;
  /** Sizing errors are settled for Review gating but block cleanup. */
  sizeHasErrors: boolean;
};

export function canOpenReview(
  scanFinished: boolean,
  targetCount: number | null,
  targets: ReviewTargetState[],
): boolean;

export function shouldOpenReview(
  step: number,
  scanFinished: boolean,
  targetCount: number | null,
  targets: ReviewTargetState[],
): boolean;

export function getCleanupReadyTargets<T extends ReviewTargetState>(targets: T[]): T[];
