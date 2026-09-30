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
  /** Project paths maintenance never selects. */
  excluded: string[];
};

/**
 * What the screen shows in the moment before settings arrive, matching the
 * `Default` impl in Rust. Rust is authoritative: `get_settings` always returns
 * a policy, so this is read on the first render and never again.
 */
export const DEFAULT_POLICY: MaintenancePolicy = {
  minIdleDays: 90,
  minBytes: 500 * 1024 * 1024,
  excluded: [],
};

export type SkipReason =
  | "excluded"
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

/** Mirrors `src-tauri/src/workspace/schedule.rs`. */
export type Schedule = {
  enabled: boolean;
  everyHours: number;
  /** Also run when the workspace's disk has less than this many GB free; `null` is off. */
  lowDiskGb: number | null;
};

/** Off by default. The first unattended deletion on a machine is one the user turned on. */
export const DEFAULT_SCHEDULE: Schedule = {
  enabled: false,
  everyHours: 24 * 7,
  lowDiskGb: null,
};

/** Why a run would not start this minute. */
export type Held =
  | "disabled"
  | "notLicensed"
  | "noWorkspace"
  | "tooSoon"
  | "scanInProgress";

/**
 * Where the schedule stands, as Rust reports it.
 *
 * `intervalHours` and `nextRunAt` arrive computed rather than derived here. A
 * settings file can be hand-edited, so the stored interval and the one in force
 * are not always the same number, and a screen that did its own arithmetic could
 * state a next run the thread does not agree with.
 */
export type ScheduleStatus = {
  schedule: Schedule;
  intervalHours: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
  held: Held | null;
  minEveryHours: number;
  maxEveryHours: number;
  /**
   * Whether closing the window leaves the app running.
   *
   * Not a `held` reason — the app is running now, so a run would start. It
   * decides whether there is a next one, because the schedule lives in this
   * process. On beside a schedule that is also on is the only combination the
   * product can promise and not deliver.
   */
  keepsRunningInBackground: boolean;
  /** Least free space across the workspace's volumes, or `null` if unreadable. */
  freeBytes: number | null;
};
