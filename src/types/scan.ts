import type { CleanMode } from "./settings";

export type Category = string;
export type Plan = "free" | "pro";
export type ConfidenceLevel = "high" | "medium" | "review";

/** Reason codes emitted by the core. Unknown codes are rendered as-is. */
export type ConfidenceSignal = string;

export type Confidence = {
  level: ConfidenceLevel;
  signals: ConfidenceSignal[];
};

export type ScanTarget = {
  id: string;
  path: string;
  name: string;
  /** The tool's name for a discovered cache. Null for workspace findings. */
  label: string | null;
  category: Category;
  plan: Plan;
  confidence: Confidence;
  /** False for a catalogued location the product reports but never removes. */
  cleanable: boolean;
  sizeBytes: number;
  sizeHasErrors: boolean;
  sizePending: boolean;
  formattedSize: string;
  lastModified: string | null;
};

export type Step = 1 | 2 | 3 | 4;

export type CleanResult = {
  freedBytes: number;
  sizeHasErrors: boolean;
  modeUsed: CleanMode;
};

export type CleanupCapabilities = {
  permanentCleanup: boolean;
  moveToTrash: boolean;
  secureIdentity: boolean;
};

export type ScanStartResult = {
  scanId: string;
};

export type ScanStarted = {
  scanId: string;
  rootPath: string;
};

export type ScanProgress = {
  scanId: string;
  directoriesScanned: number;
  targetsFound: number;
  totalBytesFound: number;
};

export type TargetFound = {
  scanId: string;
  target: ScanTarget;
};

export type TargetSized = {
  scanId: string;
  targetId: string;
  sizeBytes: number;
  sizeHasErrors: boolean;
  sizePending: boolean;
  formattedSize: string;
};

export type ScanFinished = {
  scanId: string;
  totalTargets: number;
  totalBytesFound: number;
  durationMs: number;
};

export type ScanCancelled = {
  scanId: string;
  totalTargets: number;
  totalBytesFound: number;
};

export type ScanFailed = {
  scanId: string;
  error: {
    code: string;
    message: string;
    path: string | null;
    operation: string | null;
  };
};

export type PendingScanEvent =
  | { kind: "target"; payload: TargetFound }
  | { kind: "sized"; payload: TargetSized }
  | { kind: "progress"; payload: ScanProgress }
  | { kind: "finished"; payload: ScanFinished }
  | { kind: "cancelled"; payload: ScanCancelled }
  | { kind: "failed"; payload: ScanFailed };
