/** Mirrors `report.mjs` so the module that draws the report can be typed. */

export type CleanupEvent = {
  at: string;
  freedBytes: number;
  category: string | null;
  path: string | null;
  workspace: string | null;
  mode: "Trash" | "Permanent" | null;
  trigger: "Manual" | "Scheduled";
};

export type Dimension = "category" | "workspace" | "trigger" | "mode";

export type Filters = Partial<Record<Dimension, string | null>>;

/** Also the last segment of its `insights.grains.*` i18n keys. */
export type GrainId = "day" | "week" | "month" | "all";

export type Grain = {
  id: GrainId;
  bucket: "day" | "week" | "month";
  /** How many bars, or null for everything since the first cleanup. */
  buckets: number | null;
};

export type BreakdownRow = {
  /** Null for an event recorded before the dimension existed. */
  key: string | null;
  bytes: number;
  cleanups: number;
  share: number;
};

export type Bucket = { start: string; bytes: number; cleanups: number };

export type Report = {
  grain: Grain;
  window: { from: string; to: string };
  bucket: "day" | "week" | "month";
  totals: {
    freedBytes: number;
    cleanups: number;
    activeDays: number;
    largestBytes: number;
    averageBytes: number;
  };
  previous: { freedBytes: number; cleanups: number };
  trend: number | null;
  series: Bucket[];
  breakdowns: Record<Dimension, BreakdownRow[]>;
  events: CleanupEvent[];
};

export const GRAINS: Grain[];
export const DIMENSIONS: Dimension[];

export function buildReport(input: {
  events?: CleanupEvent[];
  now?: number;
  grain?: string;
  filters?: Filters;
}): Report;
