import type { PendingScanEvent, ScanProgress, ScanTarget } from "../types/scan";

export type TerminalScanEvent = Extract<PendingScanEvent, { kind: "finished" | "cancelled" | "failed" }>;

export type ScanSessionHooks = {
  schedule: (callback: () => void) => number;
  cancelSchedule: (handle: number) => void;
  onTargets: (targets: ScanTarget[]) => void;
  onProgress: (progress: ScanProgress) => void;
  onEnd: (event: TerminalScanEvent) => void;
};

export class ScanSession {
  constructor(hooks: ScanSessionHooks);
  readonly activeScanId: string | null;
  readonly generation: number;
  readonly pending: boolean;
  readonly targets: ScanTarget[];
  commit(next: ScanTarget[] | ((current: ScanTarget[]) => ScanTarget[])): void;
  begin(): number;
  isWaiting(generation: number): boolean;
  accept(generation: number, scanId: string): boolean;
  accepts(scanId: string): boolean;
  stop(): void;
  handle(event: PendingScanEvent): void;
  flush(): void;
  discardQueue(): void;
}
