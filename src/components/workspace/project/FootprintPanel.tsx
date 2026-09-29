import { PieChart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CategoryBar, CategoryLegend } from "../../CategoryBar";
import { formatBytes } from "../../../utils/format.mjs";
import type { Footprint } from "../../../types/workspace";

/**
 * Where a project's reclaimable weight actually went.
 *
 * `byCategory` has been computed and sorted heaviest-first in Rust since the
 * footprint existed, and nothing read it — the interface could say a project
 * held 6 GB of cache and not which cache, which is the first question anyone
 * asks and the one a file manager cannot answer.
 *
 * It covers the reclaimable side only. Source code is one figure in the header
 * because there is nothing to break it into that this product has an opinion
 * about.
 */
export function FootprintPanel({ footprint }: { footprint: Footprint }) {
  const { t } = useTranslation();
  const total = footprint.byCategory.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-forest-800 pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-mist-100">
          <PieChart size={14} className="text-mist-500" aria-hidden="true" />
          {t("workspace.footprint.title")}
        </h2>
        <span className="font-mono text-xs text-mist-500">
          {footprint.hasErrors && <span className="me-0.5">&ge;</span>}
          {t("workspace.footprint.across", { size: formatBytes(total), count: footprint.byCategory.length })}
        </span>
      </div>

      <div className="mt-4">
        <CategoryBar entries={footprint.byCategory} label={t("workspace.footprint.barLabel")} />
      </div>

      <div className="mt-4">
        <CategoryLegend entries={footprint.byCategory} />
      </div>
    </div>
  );
}
