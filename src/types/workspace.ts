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
  remote: string | null;
  recoverability: Recoverability;
};

export type Activity = {
  lastActivityAt: number | null;
  idleDays: number | null;
  state: ActivityState;
};

export type WorkspaceProject = {
  name: string;
  path: string;
  /** The indexed root this project sits under. */
  root: string;
  kind: string;
  git: GitContext;
  activity: Activity;
  verdict: Verdict;
  /** Other indexed paths holding the same repository. */
  duplicateOf: string[];
  installMissing: boolean;
  installStale: boolean;
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
  freeReclaimableBytes: number;
  byCategory: CategoryBytes[];
  hasErrors: boolean;
};

export type WorkspaceIndex = {
  roots: string[];
  projects: WorkspaceProject[];
  /** Roots the plan did not cover. */
  rootsOverLimit: string[];
  rootLimit: number;
  /** Discovery hit its project or depth cap. */
  truncated: boolean;
};
