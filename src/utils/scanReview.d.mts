export type ReviewTargetState = {
  sizePending: boolean;
  /** Sizing errors are settled for Review gating but block cleanup. */
  sizeHasErrors: boolean;
  sizeBytes: number;
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

/** True once a measurement has settled at exactly zero bytes. */
export function holdsNothing(target: ReviewTargetState): boolean;

export function listReportedOnly<T extends { cleanable?: boolean; sizePending: boolean; sizeBytes: number }>(
  targets: T[],
): T[];

export function filterByAge<T extends { sizePending: boolean; lastUsedAt?: number | null }>(
  targets: T[],
  days: number,
  now?: number,
): T[];

/** `ids` itself when every one is in `available`. */
export function keepAvailableIds(ids: Set<string>, available: ReadonlySet<string>): Set<string>;

/** `targets` itself when every one is in `available`. */
export function keepAvailableTargets<T extends { id: string }>(targets: T[], available: ReadonlySet<string>): T[];

export type ConfidenceRankedTarget = {
  confidence?: { level?: string };
};

export type ListedTarget = ConfidenceRankedTarget & {
  plan?: string;
  sizeBytes?: number;
};

/** Which reading of the list is on screen. */
export type ListOrder = "confidence" | "size";

/**
 * Orders the listing. On Free the targets the plan can clean come first;
 * within each group, `order` decides — confidence by default, weight on disk
 * otherwise, with confidence breaking its ties.
 */
export function sortForListing<T extends ListedTarget>(
  targets: T[],
  proEnabled: boolean,
  order?: ListOrder,
): T[];

/**
 * Returns a new array ordered review, medium, then high. The sort is stable,
 * so targets keep their arrival order within a level.
 */
