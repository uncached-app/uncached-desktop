import type { MaintenancePolicy, Schedule } from "./maintenance";

export type CleanMode = "Trash" | "Permanent";
export type Appearance = "dark" | "light" | "system";

export type AppSettings = {
  openAtStartup: boolean;
  /** Closing the window hides it to the tray instead of quitting. */
  keepRunningInBackground: boolean;
  /** What the scan looks at outside the chosen folders. */
  detectPackageManagerCaches: boolean;
  detectAiToolCaches: boolean;
  detectEditorCaches: boolean;
  rememberLastWorkspace: boolean;
  checkForUpdates: boolean;
  defaultCleanMode: CleanMode;
  /** Paths to leave alone, one rule per line, in .gitignore syntax. */
  ignoreRules: string;
  /** Folders the user last chose to scan. */
  workspaceRoots: string[];
  appearance: Appearance;
  lastCleanup: LastCleanup | null;
  /** What a maintenance run may select. Decided in Rust; stored here. */
  maintenance: MaintenancePolicy;
  /** Whether that policy also runs with nobody present, and how often. */
  maintenanceSchedule: Schedule;
  /** Unix seconds of the last unattended attempt. Written by the backend only. */
  maintenanceLastRunAt: number | null;
};

export type IgnoreRuleProblem = {
  line: number;
  text: string;
  reason: string;
};

export type IgnoreRuleReview = {
  active: number;
  problems: IgnoreRuleProblem[];
};

export type LastCleanup = {
  removed: number;
  freedBytes: number;
};
