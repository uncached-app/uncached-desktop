import { ArrowRight, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Insight } from "../../utils/insights.d.mts";

/**
 * What the last scan says, in sentences.
 *
 * The other half of this module, and the one that answers the present. Free by
 * itself: these read a scan already on screen, and the byte counts in them are
 * one row away in the workspace list.
 */
export function Highlights({
  insights,
  projectCount,
  onFollow,
}: {
  insights: Insight[];
  projectCount: number;
  onFollow: (insight: Insight) => void;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-3 border-t border-forest-800 pt-5">
        <h2 className="text-sm font-semibold text-mist-100">From the last scan</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
          {projectCount} {projectCount === 1 ? "project" : "projects"}
        </span>
      </div>

      {insights.length === 0 ? (
        <div className="py-10 text-center">
          <Sparkles size={24} className="mx-auto text-mist-500" strokeWidth={1.5} aria-hidden="true" />
          {/* Silence is a result. Filling this space would mean inventing a
              finding, which is the one thing this module must not do. */}
          <p className="mt-3 text-sm font-semibold text-mist-300">Nothing stands out.</p>
          <p className="mt-1 text-xs text-mist-500">
            {projectCount === 0
              ? "Scan a workspace and this fills in."
              : "No project is cold, oversized, duplicated or out of step with its lockfile."}
          </p>
        </div>
      ) : (
        <ul className="mt-3 grid gap-2.5">
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
                  onClick={() => onFollow(insight)}
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
    </section>
  );
}
