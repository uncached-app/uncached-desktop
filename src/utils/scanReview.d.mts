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

export type ListedTarget = ConfidenceRankedTarget & {
  plan?: string;
};

/**
 * Orders the listing. On Free the targets the plan can clean come first;
 * within each group, and always on Pro, the confidence order applies.
 */
export function sortForListing<T extends ListedTarget>(targets: T[], proEnabled: boolean): T[];

/**
 * Returns a new array ordered review, medium, then high. The sort is stable,
 * so targets keep their arrival order within a level.
 */
