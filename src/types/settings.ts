import type { LanguagePreference } from "../i18n/locales.d.mts";
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
  detectXcodeData: boolean;
  /** Unity's and Godot's own caches, outside any project. */
  detectGameEngineCaches: boolean;
  /** The Android SDK's system images and the emulators built from them. */
  detectAndroidSdk: boolean;
  /** Docker Desktop's disk image, reported and never removed. */
  detectContainerStorage: boolean;
  rememberLastWorkspace: boolean;
  checkForUpdates: boolean;
  defaultCleanMode: CleanMode;
  /** Paths to leave alone, one rule per line, in .gitignore syntax. */
  ignoreRules: string;
  /** Folders the user last chose to scan. */
  workspaceRoots: string[];
  appearance: Appearance;
  /** A supported BCP 47 tag, or follow the operating system. */
  language: LanguagePreference;
  /** Whether the workspace's filter column is folded away. */
  workspaceSidebarHidden: boolean;
  /** Which span the Insights report is read over, by grain id. */
  insightsGrain: string;
  /** Keys the user bound differently, by action id. Overrides only. */
  shortcuts: Record<string, string>;
  /** A theme file in the config folder, by name without `.json`. */
  theme: string | null;
  /** Dock or window icon variant; `null` is the bundle icon. */
  appIcon: string | null;
  /**
   * Which detected editor and terminal a project opens in, by launcher id.
   *
   * `null` means whichever detection ranks first. Stored rather than inferred:
   * macOS has no default-terminal setting to read, and no platform has a
   * default *editor* in any sense a directory-opening app could consult.
   */
  preferredEditor: string | null;
  preferredTerminal: string | null;
  lastCleanup: LastCleanup | null;
  /** What a maintenance run may select. Decided in Rust; stored here. */
  maintenance: MaintenancePolicy;
  /** Whether that policy also runs with nobody present, and how often. */
  maintenanceSchedule: Schedule;
  /** Unix seconds of the last unattended attempt. Written by the backend only. */
  maintenanceLastRunAt: number | null;
  /** A weekly notification of what was freed and what is left; Pro, off by default. */
  weeklyDigest: boolean;
  weeklyDigestLastAt: number | null;
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
