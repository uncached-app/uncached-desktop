/** Mirrors `maintenance.mjs` so the policy can be consumed from TypeScript. */
export type MaintenancePolicy = {
  enabled: boolean;
  minIdleDays: number;
  minBytes: number;
  mode: "Trash" | "Permanent";
};

export type SkipReason =
  | "verdict"
  | "unmeasured"
  | "unknownActivity"
  | "tooRecent"
  | "tooSmall";

export type Selection = {
  project: import("../types/workspace").WorkspaceProject;
  bytes: number;
  idleDays: number;
};

export type Skipped = {
  project: import("../types/workspace").WorkspaceProject;
  reason: SkipReason;
  verdict?: string;
  idleDays?: number;
  bytes?: number;
};

export type PolicyPreview = {
  selected: Selection[];
  skipped: Skipped[];
  bytes: number;
  protectedCount: number;
};

export const ELIGIBLE_VERDICTS: string[];
export const DEFAULT_POLICY: MaintenancePolicy;

export function previewPolicy(input: {
  projects: import("../types/workspace").WorkspaceProject[];
  verdicts: Record<string, string>;
  footprints: Record<string, import("../types/workspace").Footprint>;
  policy: MaintenancePolicy;
}): PolicyPreview;
