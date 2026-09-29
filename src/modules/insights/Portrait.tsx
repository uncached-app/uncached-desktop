import { HardDrive } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CategoryBar, CategoryLegend } from "../../components/CategoryBar";
import { VERDICT_PRESENTATION } from "../../components/workspace/verdictPresentation";
import { formatBytes } from "../../utils/format.mjs";
import type { Portrait as PortraitData } from "../../utils/portrait.d.mts";

/**
 * The workspace as one picture.
 *
 * Every figure is a sum over answers already on screen somewhere — the index,
 * the footprints, the verdicts. The aggregation existed and was thrown away:
 * `insights.mjs` built the same category map to produce a single sentence about
 * concentration and discarded the rest.
 *
 * It says how many projects are still being weighed rather than waiting for
 * them, because a total that climbs while you read it is a total nobody trusts.
 */
export function Portrait({
  portrait,
  onOpenWorkspace,
}: {
  portrait: PortraitData;
  onOpenWorkspace: () => void;
}) {
  const { t } = useTranslation();
  if (portrait.projects === 0) return null;

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-mist-100">
            <HardDrive size={15} className="text-mist-500" aria-hidden="true" />
            {t("insights.portrait.title")}
          </h2>
          <p className="mt-0.5 text-xs text-mist-500">
            {t("insights.portrait.projects", { count: portrait.projects })}
            {/* Named rather than waited for: a figure that keeps climbing while
                someone reads it is a figure they stop believing. */}
            {portrait.pending > 0 && <> · {t("insights.portrait.pending", { count: portrait.pending })}</>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Metric value={formatBytes(portrait.totalBytes)} label={t("insights.portrait.onDisk")} />
          <Metric
            value={formatBytes(portrait.reclaimableBytes)}
            label={t("insights.portrait.reclaimable")}
            accent={portrait.reclaimableBytes > 0}
          />
          <Metric value={formatBytes(portrait.sourceBytes)} label={t("insights.portrait.yourWork")} />
        </div>
      </div>

      {portrait.categories.length > 0 && (
        <>
          <div className="mt-4">
            <CategoryBar
              entries={portrait.categories}
              label={t("insights.portrait.barLabel")}
            />
          </div>
          <div className="mt-4">
            <CategoryLegend entries={portrait.categories} />
          </div>
        </>
      )}

      {portrait.verdicts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-forest-800 pt-3">
          {portrait.verdicts.map(({ verdict, count }) => {
            const presentation = VERDICT_PRESENTATION[verdict];
            if (!presentation) return null;
            return (
              <button
                key={verdict}
                type="button"
                onClick={() => onOpenWorkspace()}
                title={t(presentation.summaryKey)}
                className="group inline-flex items-center gap-1.5 text-xs text-mist-500 transition-colors hover:text-mist-100"
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${presentation.dotClassName}`}
                  aria-hidden="true"
                />
                <span className="font-mono font-semibold text-mist-300 group-hover:text-mist-100">
                  {count}
                </span>
                <span>{t(presentation.labelKey)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({
  value,
  label,
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="text-end">
      <span
        className={`block font-mono text-sm font-bold ${accent ? "text-sage-300" : "text-mist-100"}`}
      >
        {value}
      </span>
      <span className="block font-mono text-[10px] uppercase tracking-wider text-mist-500">
        {label}
      </span>
    </div>
  );
}
