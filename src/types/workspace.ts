export type WorkspaceProject = {
  name: string;
  path: string;
  /** Which indexed root this project was found under. */
  root: string;
  kind: string;
  branch: string | null;
  lastCommit: string | null;
  dirty: boolean | null;
};

export type CategoryBytes = {
  category: string;
  bytes: number;
};

/**
 * What a project weighs, split the way a decision needs it. `source` is the
 * real weight of the work — it is what distinguishes a large project from a
 * merely dirty one.
 */
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
  /** Roots the plan did not cover, named so the gap is never silent. */
  rootsOverLimit: string[];
  rootLimit: number;
  /** Discovery stopped at its project or depth cap. */
  truncated: boolean;
};
