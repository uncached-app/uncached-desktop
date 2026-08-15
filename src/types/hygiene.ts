/**
 * Mirrors `src-tauri/src/workspace/hygiene.rs`.
 *
 * The classification lives in Rust for the same reason the maintenance policy
 * does: `prunable` decides which branch a button is allowed to delete, and a
 * second definition here would be free to disagree with the one Git is checked
 * against.
 */
export type BranchState = "prunable" | "holdsWork";

export type DeadBranch = {
  name: string;
  state: BranchState;
  lastCommitAt: number | null;
};

export type Stash = {
  /** `stash@{0}`, so the user can reach it themselves. */
  reference: string;
  message: string;
  at: number | null;
};

export type Worktree = {
  path: string;
  branch: string | null;
  /** Registered in `.git/worktrees`, but the directory is not there. */
  missing: boolean;
  primary: boolean;
};

export type Hygiene = {
  deadBranches: DeadBranch[];
  stashes: Stash[];
  worktrees: Worktree[];
};

export type FetchResult = {
  hygiene: Hygiene;
  fetchedAt: number;
};

export type RefusedBranch = {
  name: string;
  reason: string;
};

export type PruneResult = {
  deleted: string[];
  refused: RefusedBranch[];
  hygiene: Hygiene;
};

export const EMPTY_HYGIENE: Hygiene = {
  deadBranches: [],
  stashes: [],
  worktrees: [],
};

export function isEmpty(hygiene: Hygiene): boolean {
  return (
    hygiene.deadBranches.length === 0 &&
    hygiene.stashes.length === 0 &&
    hygiene.worktrees.length === 0
  );
}

/** Mirrors `commands/git.rs`. One repository carrying something. */
export type RepositoryHygiene = {
  path: string;
  name: string;
  hygiene: Hygiene;
  /** How many of its dead branches `git branch -d` would accept. */
  prunable: number;
};

export type WorkspaceHygiene = {
  /** Only the ones with something to report, most to say first. */
  repositories: RepositoryHygiene[];
  /** Repositories read, including the ones that turned out to be clean. */
  examined: number;
  deadBranches: number;
  prunable: number;
  stashes: number;
  worktrees: number;
};

export const EMPTY_WORKSPACE_HYGIENE: WorkspaceHygiene = {
  repositories: [],
  examined: 0,
  deadBranches: 0,
  prunable: 0,
  stashes: 0,
  worktrees: 0,
};
