/** Mirrors `src-tauri/src/workspace/duplicates.rs`. */
export type DuplicatePackage = {
  name: string;
  version: string;
  /** Projects holding their own copy, never copies within one project. */
  copies: number;
  /** One copy, measured. `null` when its size could not be read. */
  bytesEach: number | null;
  /** `bytesEach` times the copies past the first. */
  wastedBytes: number;
  projects: string[];
  samplePath: string;
};

export type DuplicateReport = {
  packages: DuplicatePackage[];
  wastedBytes: number;
  scannedProjects: number;
  /** Projects whose packages are links into a shared store, so they duplicate nothing. */
  sharedProjects: number;
  distinctPackages: number;
};

export const EMPTY_REPORT: DuplicateReport = {
  packages: [],
  wastedBytes: 0,
  scannedProjects: 0,
  sharedProjects: 0,
  distinctPackages: 0,
};

/** A package the workspace list is narrowed to: the projects keeping a copy of it. */
export type PackageFilter = {
  name: string;
  version: string;
  projects: string[];
};
