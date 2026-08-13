export type CleanMode = "Trash" | "Permanent";
export type Appearance = "dark" | "light" | "system";

export type AppSettings = {
  openAtStartup: boolean;
  rememberLastWorkspace: boolean;
  checkForUpdates: boolean;
  detectNodeModules: boolean;
  detectCargoTarget: boolean;
  detectGradleCache: boolean;
  detectNextCache: boolean;
  detectTurboCache: boolean;
  defaultCleanMode: CleanMode;
  /** Paths to leave alone, one rule per line, in .gitignore syntax. */
  ignoreRules: string;
  appearance: Appearance;
  lastCleanup: LastCleanup | null;
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
