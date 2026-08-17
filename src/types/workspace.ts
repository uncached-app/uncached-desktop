export type RecoverabilityLevel = "fullyRemote" | "localOnlyWork" | "noRemote" | "unknown";
export type ActivityState = "active" | "idle" | "cold" | "unknown";
export type Verdict =
  | "safe"
  | "tradeOff"
  | "protect"
  | "archivable"
  | "broken"
  | "staleDeps"
  | "unknown";

export type Recoverability = {
  unpushedCommits: number;
  branchesWithoutUpstream: number;
  stashEntries: number;
  untrackedFiles: number;
  level: RecoverabilityLevel;
};

export type GitContext = {
  branch: string | null;
  lastCommitSummary: string | null;
  lastCommitAt: number | null;
  dirty: boolean | null;
  /** As Git reported it, not normalised. */
  remote: string | null;
  /** The remote does not leave this machine: a sibling folder, `file://`. */
  remoteIsLocal: boolean;
  /**
   * Commits the upstream has and this does not, worth only as much as
   * `lastFetchAt` below it. `null` when there is no upstream to be behind.
   */
  behind: number | null;
  /** When this repository last spoke to its remote. `null` means never. */
  lastFetchAt: number | null;
  recoverability: Recoverability;
};

export type Activity = {
  lastActivityAt: number | null;
  idleDays: number | null;
  state: ActivityState;
};

/**
 * Mirrors `src-tauri/src/workspace/restore.rs`.
 *
 * `pinnedBy` is the whole point. A reinstall is only a restore when something
 * fixes which versions come back; `null` means the space returns and that exact
 * set of dependencies does not.
 */
export type Restore = {
  manager: string;
  command: string;
  pinnedBy: string | null;
};

export type WorkspaceProject = {
  name: string;
  path: string;
  /** The indexed root this project sits under. */
  root: string;
  kind: string;
  git: GitContext;
  activity: Activity;
  /** Other indexed paths holding the same repository. */
  duplicateOf: string[];
  installMissing: boolean;
  installStale: boolean;
  /**
   * How what a reclaim removes would come back, and whether it would come back
   * the same. `null` when nothing here identifies a package manager.
   */
  restore: Restore | null;
  /** The directory this shares with at least one other project, if any. */
  family: string | null;
};

/**
 * A directory holding more than one of the indexed projects.
 *
 * Two strengths of belonging: `declaredBy` names the tool that calls this a
 * workspace, and its absence means somebody filed them together — a decision,
 * but not one any tool enforces.
 */
export type Family = {
  path: string;
  name: string;
  declaredBy: string | null;
  members: string[];
};

export type CategoryBytes = {
  category: string;
  bytes: number;
};

/** `source` is the weight left once artifacts are removed. */
export type Footprint = {
  totalBytes: number;
  sourceBytes: number;
  reclaimableBytes: number;
  byCategory: CategoryBytes[];
  hasErrors: boolean;
};

/**
 * A project with a process working inside it right now.
 *
 * Its artifacts are not reclaimable while that is true: the tree is being
 * written to, so a weight is a number that is already wrong, and a removal
 * either fails or takes files the process still has open.
 */
export type RunningProject = {
  path: string;
  /** The command name, for a sentence that can say what is holding it. */
  command: string;
  /** How many processes are inside, when it is more than the one. */
  processes: number;
};

export type WorkspaceIndex = {
  roots: string[];
  projects: WorkspaceProject[];
  /** Roots the plan did not cover. */
  rootsOverLimit: string[];
  rootLimit: number;
  /** Discovery hit its project or depth cap. */
  truncated: boolean;
  /** Folders the system would not open, so projects inside them are missing. */
  unreadable: number;
  /** The first few of them, so the user can see which access to grant. */
  unreadableSample: string[];
  /** Directories holding more than one of these projects. */
  families: Family[];
};
