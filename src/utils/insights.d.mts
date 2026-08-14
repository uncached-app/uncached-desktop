/** Mirrors `insights.mjs` so the module can be consumed from TypeScript. */
/**
 * Only the destinations the workspace map can actually honour.
 *
 * `category` and `duplicates` were here and were never handled: the map filters
 * by root, by text and by verdict, and by nothing else. Both rendered a button
 * promising to show something and opened an unfiltered list. They are sentences
 * now, and the type is what stops a third one being added the same way.
 */
export type InsightAction =
  | { kind: "verdict"; verdict: string }
  | { kind: "project"; path: string };

export type Insight = {
  id: string;
  bytes: number;
  text: string;
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
