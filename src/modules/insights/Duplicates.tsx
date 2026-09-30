import { ArrowRight, Copy, Layers, Link2, Loader2 } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { DuplicatePackage, DuplicateReport } from "../../types/duplicates";
import { formatBytes } from "../../utils/format.mjs";
import { ShowMore } from "../../components/shared/ShowMore";
import { useShowMore } from "../../hooks/useShowMore";

/** How many rows a Free reader gets. The total is never one of the hidden ones. */
const FREE_ROWS = 3;
const SHOWN_AT_FIRST = 8;
const SHOWN_PER_STEP = 20;
/** Project names printed on a row before the rest are counted. */
const NAMED_PROJECTS = 3;

function projectName(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() ?? path;
}

/**
 * The same package, installed once per project.
 *
 * Read-only by design, and this screen says so: WORKSPACE_REDESIGN section 8
 * puts a measured inventory first of four stages, and the three after it are
 * where a bug stops wasting space and starts breaking the environment the user
 * works in. There is no button here that removes anything, and there should not
 * be one until the measurement has been trusted for a while.
 *
 * Free gets the total and the heaviest few; Pro gets the list. The total is
 * never withheld — it is the sentence that makes anyone want the rest.
 */
export function Duplicates({
  report,
  running,
  error,
  proEnabled,
  onShowProjects,
}: {
  report: DuplicateReport | null;
  running: boolean;
  error: string | null;
  proEnabled: boolean;
  /** Opens the workspace list narrowed to the projects holding this package. */
  onShowProjects: (entry: DuplicatePackage) => void;
}) {
  const { t } = useTranslation();
  const rows = report ? (proEnabled ? report.packages : report.packages.slice(0, FREE_ROWS)) : [];
  const hidden = report && !proEnabled ? Math.max(0, report.packages.length - FREE_ROWS) : 0;
  const more = useShowMore(rows.length, SHOWN_AT_FIRST, SHOWN_PER_STEP);

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-mist-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-mist-100">
            {t("insights.duplicates.title")}
          </h2>
        </div>

        {running ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs text-mist-500">
            <Loader2 size={12} className="animate-spin text-sage-300" aria-hidden="true" />
            {t("insights.reading")}
          </span>
        ) : report ? (
          <span className="font-mono text-xs text-mist-500">
            {t("insights.duplicates.distinct", { count: report.distinctPackages })}
          </span>
        ) : null}
      </div>

      {error && <p className="mt-3 font-mono text-[11px] leading-5 text-coral-300">{error}</p>}

      {report && (
        <>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-mist-300">
              {report.wastedBytes > 0 ? (
                <Trans
                  i18nKey="insights.duplicates.wasted"
                  values={{ size: formatBytes(report.wastedBytes) }}
                  components={{ size: <span className="font-mono font-semibold text-sage-300" /> }}
                />
              ) : (
                t("insights.duplicates.none")
              )}
            </p>
            {report.wastedBytes > 0 && (
              <span className="font-mono text-xs font-bold text-sage-300 shrink-0">
                {formatBytes(report.wastedBytes)}
              </span>
            )}
          </div>

          {rows.length > 0 && (
            <ul className="mt-3 divide-y divide-forest-800">
              {rows.slice(0, more.visible).map((entry) => (
                <li
                  key={`${entry.name}@${entry.version}`}
                  className="flex items-center justify-between gap-4 py-2.5 px-1 rounded-lg transition-colors hover:bg-forest-850/30"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Copy size={12} className="shrink-0 text-mist-500" aria-hidden="true" />
                    <div className="min-w-0">
                      <span className="block truncate font-mono text-xs text-mist-100">
                        {entry.name}
                        <span className="text-mist-500">@{entry.version}</span>
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] text-mist-500">
                        {t("insights.duplicates.copies", { count: entry.copies })}
                        {entry.bytesEach !== null &&
                          ` · ${t("insights.duplicates.each", { size: formatBytes(entry.bytesEach) })}`}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-mist-500" title={entry.projects.join("\n")}>
                        {entry.projects.length > NAMED_PROJECTS
                          ? t("insights.duplicates.inProjectsMore", {
                              names: entry.projects.slice(0, NAMED_PROJECTS).map(projectName).join(", "),
                              count: entry.projects.length - NAMED_PROJECTS,
                            })
                          : t("insights.duplicates.inProjects", {
                              names: entry.projects.map(projectName).join(", "),
                            })}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-xs font-bold text-mist-100">
                      {formatBytes(entry.wastedBytes)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onShowProjects(entry)}
                      aria-label={t("insights.duplicates.showProjectsLabel", { name: entry.name })}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-mist-500 transition-colors hover:bg-forest-850 hover:text-sage-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage-400"
                    >
                      {t("insights.duplicates.showProjects")}
                      <ArrowRight size={11} className="rtl:-scale-x-100" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2">
            <ShowMore
              remaining={more.remaining}
              step={SHOWN_PER_STEP}
              canCollapse={more.canCollapse}
              onShowMore={more.showMore}
              onCollapse={more.collapse}
            />
          </div>

          {hidden > 0 && (
            <p className="mt-3 border-t border-forest-800 pt-3 text-xs text-mist-500">
              {t("insights.duplicates.hidden", { count: hidden })}
            </p>
          )}

          {report.sharedProjects > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-sage-300">
              <Link2 size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{t("insights.duplicates.shared", { count: report.sharedProjects })}</span>
            </p>
          )}

          {report.packages.length > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-mist-500">
              {t("insights.duplicates.note")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
