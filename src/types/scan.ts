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
  /** The owning tool's command that reclaims a location that is not cleanable. */
  reclaimWith: string | null;
  /**
   * The program using this directory right now, if one is.
   *
   * Different from `cleanable`, which says what the thing permanently is. This
   * says the cache is disposable and this is not the moment: removing it while
   * its owner is mid-write breaks what was running rather than freeing space.
   * The backend refuses it again at removal, so this is what the row shows
   * rather than what makes it safe.
   */
  blockedBy?: string | null;
  sizeBytes: number;
  /** Newest write inside, in seconds since the epoch. Null while unmeasured. */
  lastUsedAt: number | null;
  sizeHasErrors: boolean;
  sizePending: boolean;
  formattedSize: string;
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

/**
 * Which half of the scan the counts belong to.
 *
 * `workspace` is the walk through the chosen folders; `caches` is the pass over
 * the tool caches in the home directory, where the directory counter no longer
 * moves and the paths belong to no project. Optional, because a core that
 * predates the field must still produce a scan.
 */
export type ScanPhase = "workspace" | "caches";

export type ScanProgress = {
  scanId: string;
  directoriesScanned: number;
  targetsFound: number;
  totalBytesFound: number;
  phase?: ScanPhase;
};

export type TargetFound = {
  scanId: string;
  target: ScanTarget;
};

export type TargetSized = {
  scanId: string;
  targetId: string;
  sizeBytes: number;
  lastUsedAt?: number | null;
  sizeHasErrors: boolean;
  sizePending: boolean;
  formattedSize: string;
};

export type ScanFinished = {
  scanId: string;
  totalTargets: number;
  totalBytesFound: number;
  durationMs: number;
  /**
   * Folders the walk was not allowed to open.
   *
   * Above zero, both figures beside it are short by whatever is inside them.
   * On macOS without Full Disk Access that is the ordinary case.
   */
  unreadable: number;
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

/**
 * Something that happened to a scan and has nowhere else to appear.
 *
 * Not a status line. The screens already name the phase the backend is in —
 * step 2 says whether it is walking or measuring, and counts both — so a
 * string repeating that had one renderer and seven values it never reached.
 * What was missing is narrower: the two outcomes that leave nothing on screen
 * to see, one of them a Cancel the backend refused because the scan had
 * already ended.
 */
export type ScanNotice =
  | { kind: "cancelled"; targetsFound: number | null }
  | { kind: "cancelRefused" };

export type PendingScanEvent =
  | { kind: "target"; payload: TargetFound }
  | { kind: "sized"; payload: TargetSized }
  | { kind: "progress"; payload: ScanProgress }
  | { kind: "finished"; payload: ScanFinished }
  | { kind: "cancelled"; payload: ScanCancelled }
  | { kind: "failed"; payload: ScanFailed };
