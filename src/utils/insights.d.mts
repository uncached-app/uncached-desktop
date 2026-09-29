/** Mirrors `insights.mjs` so the module can be consumed from TypeScript. */
/**
 * Only the destinations the workspace map can actually honour.
 *
 * `category` and `duplicates` were briefly absent: the map filtered by root,
 * text and verdict and nothing else, so both rendered a button promising to
 * show something and opened an unfiltered list. The map filters by artifact
 * kind and by clone now, so both are back — and the type is still what stops a
 * fourth being added before the destination exists.
 */
export type InsightAction =
  | { kind: "verdict"; verdict: string }
  | { kind: "project"; path: string }
  | { kind: "category"; category: string }
  | { kind: "duplicates" };

/** An i18n key under `insights.highlights.findings`, and what fills it. */
export type InsightMessage = {
  key:
    | "insights.highlights.findings.cold"
    | "insights.highlights.findings.heaviest"
    | "insights.highlights.findings.concentration"
    | "insights.highlights.findings.duplicates"
    | "insights.highlights.findings.stale"
    | "insights.highlights.findings.protect"
    | "insights.highlights.findings.reclaimed";
  /** Byte counts arrive already formatted by the injected `formatBytes`. */
  params: Record<string, string | number>;
};

export type Insight = {
  id: string;
  bytes: number;
  message: InsightMessage;
  pinned?: boolean;
  action?: InsightAction;
};

/** Stands in for a measurement a plan does not include. */
export const REDACTED: string;

export function buildInsights(input: {
  projects: unknown[];
  footprints: Record<string, unknown>;
  verdicts: Record<string, unknown>;
  totals: { allTimeBytes: number; cleanups: number } | null;
  formatBytes: (bytes: number) => string;
}): Insight[];
