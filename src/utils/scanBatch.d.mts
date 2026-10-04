import type { PendingScanEvent, ScanProgress, ScanTarget, TargetSized } from "../types/scan";

/** The events a batch can hold: the ones that change what the list shows. */
export type BatchableScanEvent = Extract<PendingScanEvent, { kind: "target" | "sized" | "progress" }>;

export function applyScanEvents(
  targets: ScanTarget[],
  pendingSizes: Map<string, TargetSized>,
  events: BatchableScanEvent[],
): { targets: ScanTarget[]; progress: ScanProgress | null };
