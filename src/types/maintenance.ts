import type { Verdict } from "./workspace";

/**
 * Mirrors `src-tauri/src/workspace/maintenance.rs`.
 *
 * The rule these describe lives in Rust, not here: it decides what an
 * unattended run may delete, and a second definition free to drift from the
 * first is how the interface ends up disagreeing with the backend about which
 * projects are safe. This file only names the shapes crossing the boundary.
 */
export type MaintenancePolicy = {
  minIdleDays: number;
  minBytes: number;
};

/**
 * What the screen shows in the moment before settings arrive, matching the
 * `Default` impl in Rust. Rust is authoritative: `get_settings` always returns
 * a policy, so this is read on the first render and never again.
 */
export const DEFAULT_POLICY: MaintenancePolicy = {
  minIdleDays: 90,
  minBytes: 500 * 1024 * 1024,
};

export type SkipReason =
  | "verdict"
  | "unmeasured"
  | "unknownActivity"
  | "tooRecent"
  | "tooSmall";

/** One project, reduced to the four facts the policy reads. */
export type MaintenanceCandidate = {
  path: string;
  name: string;
  verdict: Verdict;
  idleDays: number | null;
  reclaimableBytes: number | null;
};

export type Selected = {
  path: string;
  name: string;
  bytes: number;
  idleDays: number;
};

export type Skipped = {
  path: string;
  name: string;
  reason: SkipReason;
  verdict: Verdict;
};

export type MaintenancePreview = {
  selected: Selected[];
  skipped: Skipped[];
  bytes: number;
  protectedCount: number;
};

export const EMPTY_PREVIEW: MaintenancePreview = {
  selected: [],
  skipped: [],
  bytes: 0,
  protectedCount: 0,
};
