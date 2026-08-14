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

export type Range = { id: string; label: string; days: number | null };

export type BreakdownRow = {
  /** Null for an event recorded before the dimension existed. */
  key: string | null;
  bytes: number;
  cleanups: number;
  share: number;
};

export type Bucket = { start: string; bytes: number; cleanups: number };

export type Report = {
  window: { from: string; to: string; days: number };
  bucket: "day" | "week" | "month";
  totals: {
    freedBytes: number;
    cleanups: number;
    activeDays: number;
    largestBytes: number;
    averageBytes: number;
    perDayBytes: number;
  };
  previous: { freedBytes: number; cleanups: number };
  trend: number | null;
  series: Bucket[];
  breakdowns: Record<Dimension, BreakdownRow[]>;
  events: CleanupEvent[];
};

export const RANGES: Range[];
export const DIMENSIONS: Dimension[];

export function buildReport(input: {
  events?: CleanupEvent[];
  now?: number;
  rangeDays?: number | null;
  filters?: Filters;
}): Report;
