export type WorkspaceProject = {
  name: string;
  path: string;
  kind: string;
  branch: string | null;
  lastCommit: string | null;
  dirty: boolean | null;
};

export type WorkspaceIndex = {
  rootPath: string;
  projects: WorkspaceProject[];
};
