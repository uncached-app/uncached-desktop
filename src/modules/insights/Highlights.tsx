import { ArrowRight, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  return (
    <section className="mt-6 rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-sage-300" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-mist-100">{t("insights.highlights.title")}</h2>
        </div>

        <span className="font-mono text-xs text-mist-500">
          {t("insights.highlights.scanned", { count: projectCount })}
        </span>
      </div>

      {insights.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm font-medium text-mist-100">{t("insights.highlights.emptyTitle")}</p>
          <p className="mt-1 text-xs text-mist-500 max-w-sm mx-auto">
            {projectCount === 0
              ? t("insights.highlights.emptyNoScan")
              : t("insights.highlights.emptyQuiet")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-forest-800">
          {insights.map((insight, position) => (
            <motion.li
              key={insight.id}
              initial={reducedMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: position * 0.03, duration: 0.2 }}
            >
              {insight.action ? (
                <button
                  type="button"
                  onClick={() => onFollow(insight)}
                  className="group flex w-full items-center justify-between gap-4 py-3 text-start transition-colors hover:bg-forest-850/40 px-2 rounded-lg"
                >
                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-mist-100">
                    {t(insight.message.key, insight.message.params)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1 text-xs font-medium text-mist-500 group-hover:text-sage-300 transition-colors">
                    <span className="font-mono text-[11px]">{t("insights.highlights.view")}</span>
                    <ArrowRight
                      size={13}
                      className="rtl:-scale-x-100 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </div>
                </button>
              ) : (
                <div className="py-3 px-2 text-xs leading-relaxed text-mist-300">
                  {t(insight.message.key, insight.message.params)}
                </div>
              )}
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}
