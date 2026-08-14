/** Mirrors `insights.mjs` so the module can be consumed from TypeScript. */
export type InsightAction =
  | { kind: "verdict"; verdict: string }
  | { kind: "project"; path: string }
  | { kind: "category"; category: string }
  | { kind: "duplicates" };

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
