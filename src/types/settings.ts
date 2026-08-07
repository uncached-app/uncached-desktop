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
  appearance: Appearance;
  lastCleanup: LastCleanup | null;
};

export type LastCleanup = {
  removed: number;
  freedBytes: number;
};
