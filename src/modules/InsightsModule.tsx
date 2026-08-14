import { ArrowRight, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import { useWorkspaceHistory } from "../hooks/useWorkspaceHistory";
import { REDACTED, buildInsights } from "../utils/insights.mjs";
import { formatBytes } from "../utils/format";
import { openExternalUrl } from "../utils/externalLink";
import type { Verdict } from "../types/workspace";

type Insight = {
  id: string;
  text: string;
  action?:
    | { kind: "verdict"; verdict: Verdict }
    | { kind: "project"; path: string }
    | { kind: "category"; category: string }
    | { kind: "duplicates" };
};

/**
 * What the workspace adds up to, in sentences.
 *
 * Nothing here is computed for this screen: every number comes from a
 * measurement the scan already took. That is the point of the module — the same
 * data the list shows one row at a time, read as a whole.
 *
 * Sentences lead somewhere. Clicking one narrows the workspace to the projects
 * it is about, which is the difference between an insight and a caption.
 */
export function InsightsModule({
  proEnabled,
  onOpenWorkspace,
}: {
  proEnabled: boolean;
  onOpenWorkspace: () => void;
}) {
  const flow = usePurgeFlow();
  const reducedMotion = useReducedMotion();
  const projects = flow.index.index?.projects ?? [];
  const { totals } = useWorkspaceHistory(projects, flow.footprints, flow.measuring);

  const insights = useMemo(
    () =>
      buildInsights({
        projects,
        footprints: flow.footprints,
        verdicts: flow.verdicts,
        totals,
        // Free reads every sentence and none of the quantities. The screen
        // never decides this per-line: it hands the builder a formatter with no
        // numbers to give, and the sentences come back already honest.
        formatBytes: proEnabled ? formatBytes : () => REDACTED,
      }) as Insight[],
    [projects, flow.footprints, flow.verdicts, totals, proEnabled],
  );

  function follow(insight: Insight) {
    if (!insight.action) return;
    if (insight.action.kind === "verdict") flow.setActiveVerdict(insight.action.verdict);
    onOpenWorkspace();
  }

  return (
    <section aria-label="Workspace insights" className="flex h-full w-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-forest-800 pb-4">
        <h1 className="text-2xl font-semibold tracking-[-0.045em] text-mist-100">Insights</h1>
        <p className="mt-1.5 text-sm text-mist-500">
          What the last scan adds up to, across {projects.length}{" "}
          {projects.length === 1 ? "project" : "projects"}.
        </p>
      </header>

      {!proEnabled && insights.length > 0 && (
        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-pro-200/30 bg-pro-surface px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-mist-100">
              {insights.length} {insights.length === 1 ? "finding" : "findings"}, without the numbers
            </p>
            <p className="mt-1 text-xs leading-5 text-mist-500">
              Pro measures each one, keeps the history, and tells you what changed since your last visit.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openExternalUrl("https://uncached.app/pro")}
            className="shrink-0 rounded-xl bg-pro-200 px-3 py-2 text-xs font-semibold text-forest-950 transition-colors hover:bg-pro-100"
          >
            Get Uncached Pro
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pt-5 pb-6 [scrollbar-gutter:stable]">
        {insights.length === 0 ? (
          <div className="py-16 text-center">
            <Sparkles size={28} className="mx-auto text-mist-500" strokeWidth={1.5} aria-hidden="true" />
            {/* Silence is a result. Filling this space would mean inventing a
                finding, which is the one thing this module must not do. */}
            <p className="mt-3 text-sm font-semibold text-mist-300">Nothing stands out.</p>
            <p className="mt-1 text-xs text-mist-500">
              {projects.length === 0
                ? "Scan a workspace and this fills in."
                : "No project is cold, oversized, duplicated or out of step with its lockfile."}
            </p>
          </div>
        ) : (
          <ul className="grid gap-2.5">
            {insights.map((insight, position) => (
              <motion.li
                key={insight.id}
                initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: position * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                {insight.action ? (
                  <button
                    type="button"
                    onClick={() => follow(insight)}
                    className="group flex w-full items-center gap-4 rounded-2xl border border-forest-800 bg-forest-900 px-4 py-3.5 text-left transition-colors hover:border-sage-400"
                  >
                    <span className="min-w-0 flex-1 text-sm leading-6 text-mist-100">{insight.text}</span>
                    <ArrowRight
                      size={15}
                      className="shrink-0 text-mist-500 transition-colors group-hover:text-sage-300"
                      aria-hidden="true"
                    />
                  </button>
                ) : (
                  <p className="rounded-2xl border border-forest-800 bg-forest-950 px-4 py-3.5 text-sm leading-6 text-mist-500">
                    {insight.text}
                  </p>
                )}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
