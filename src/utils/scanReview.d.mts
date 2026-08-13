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

export type ConfidenceRankedTarget = {
  confidence?: { level?: string };
};

/**
 * Returns a new array ordered review, medium, then high. The sort is stable,
 * so targets keep their arrival order within a level.
 */
export function sortByConfidence<T extends ConfidenceRankedTarget>(targets: T[]): T[];
