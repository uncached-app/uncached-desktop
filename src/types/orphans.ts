/** Mirrors `src-tauri/src/workspace/orphans.rs`. */
export type Orphan = {
  path: string;
  /** The directory it sits in, which is the one holding no manifest. */
  parent: string;
  label: string;
  /** `null` when the size could not be read. Never treated as zero. */
  bytes: number | null;
  /**
   * Whether a command could rebuild this if its project came back.
   *
   * False for a virtual environment. It is still dead weight, for the opposite
   * reason to everything else here: not because rebuilding is cheap, but
   * because nothing is left that could use it.
   */
  regenerable: boolean;
};

export type OrphanReport = {
  /** Heaviest first. */
  orphans: Orphan[];
  bytes: number;
  /** Directories the walk looked at, so an empty report can say it looked. */
  examined: number;
};

export const EMPTY_ORPHANS: OrphanReport = {
  orphans: [],
  bytes: 0,
  examined: 0,
};
