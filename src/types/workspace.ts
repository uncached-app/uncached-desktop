export type WorkspaceProject = {
  name: string;
  path: string;
  /** The indexed root this project sits under. */
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
