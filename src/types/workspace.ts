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

export type WorkspaceIndex = {
  roots: string[];
  projects: WorkspaceProject[];
  /** Roots the plan did not cover, named so the gap is never silent. */
  rootsOverLimit: string[];
  rootLimit: number;
  /** Discovery stopped at its project or depth cap. */
  truncated: boolean;
};
