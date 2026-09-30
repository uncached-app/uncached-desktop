import { Info, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Panel } from "./panels";
import { ShowMore } from "../../shared/ShowMore";
import { useShowMore } from "../../../hooks/useShowMore";
import { formatBytes } from "../../../utils/format.mjs";
import type { DuplicatePackage } from "../../../types/duplicates";

const SHOWN_AT_FIRST = 5;
const SHOWN_PER_STEP = 20;

/**
 * Packages this project keeps its own copy of, that other projects also keep.
 *
 * Clean, unified list layout matching the rest of the app.
 */
export function SharedPanel({
  packages,
  running,
}: {
  /** Already narrowed to this project. Heaviest first. */
  packages: DuplicatePackage[];
  /** The reading has not finished, so an empty list means nothing yet. */
  running: boolean;
}) {
  const { t } = useTranslation();
  const more = useShowMore(packages.length, SHOWN_AT_FIRST, SHOWN_PER_STEP);

  if (packages.length === 0) {
    return running ? (
      <Panel title={t("workspace.shared.title")}>
        <p className="text-xs text-mist-500">{t("workspace.shared.reading")}</p>
      </Panel>
    ) : null;
  }

  const wasted = packages.reduce((sum, entry) => sum + entry.wastedBytes, 0);

  return (
    <Panel
      title={t("workspace.shared.titleCount", { count: packages.length })}
      action={
        wasted > 0 ? (
          <span className="font-mono text-xs font-semibold text-sage-300">
            {t("workspace.shared.duplicate", { size: formatBytes(wasted) })}
          </span>
        ) : null
      }
    >
      <div className="space-y-3">
        <p className="text-xs leading-5 text-mist-500">
          {t("workspace.shared.intro")}
        </p>

        {/* Clean, unified list container */}
        <div className="overflow-hidden rounded-xl border border-forest-800 bg-forest-950/60">
          <ul className="divide-y divide-forest-800/60">
            {packages.slice(0, more.visible).map((entry) => (
              <li
                key={`${entry.name}@${entry.version}`}
                className="group flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-forest-900/60"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Package
                    size={14}
                    className="shrink-0 text-mist-500 transition-colors group-hover:text-sage-300"
                    aria-hidden="true"
                  />
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-xs font-semibold text-mist-100">
                      {entry.name}
                    </span>
                    <span className="shrink-0 rounded bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-400">
                      v{entry.version}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-[11px] text-mist-400">
                    {t("workspace.shared.inProjects", { count: entry.copies })}
                  </span>
                  {entry.bytesEach !== null && (
                    <span className="min-w-14 text-end font-mono text-xs font-semibold text-mist-100">
                      {formatBytes(entry.bytesEach)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <ShowMore
          remaining={more.remaining}
          step={SHOWN_PER_STEP}
          canCollapse={more.canCollapse}
          onShowMore={more.showMore}
          onCollapse={more.collapse}
        />

        <div className="flex items-center gap-2 text-[11px] leading-5 text-mist-500">
          <Info size={12} className="shrink-0 text-mist-500" aria-hidden="true" />
          <p>
            {t("workspace.shared.hint")}
          </p>
        </div>
      </div>
    </Panel>
  );
}
