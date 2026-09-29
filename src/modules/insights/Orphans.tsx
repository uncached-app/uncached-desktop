import { FolderSearch, Ghost, Loader2 } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { OrphanReport } from "../../types/orphans";
import { formatBytes } from "../../utils/format.mjs";

/**
 * Regenerable directories that no project claims any more.
 *
 * Free on every plan. This reports something the app will not act on, and a
 * finding the product refuses to touch is not a capability to sell.
 *
 * Read-only, and the screen says why rather than leaving it as a missing
 * button. Every scanner confirms an artifact by the manifest beside it, which
 * is what stops cleanup deleting a directory it merely recognised by name — and
 * it is also why an orphan can never be confirmed. Offering a button the
 * backend would decline would be worse than offering none.
 */
export function Orphans({
  report,
  running,
  error,
  onReveal,
}: {
  report: OrphanReport | null;
  running: boolean;
  error: string | null;
  onReveal: (path: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div className="flex items-center gap-2">
          <Ghost size={14} className="text-mist-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-mist-100">
            {t("insights.orphans.title")}
          </h2>
        </div>

        {running ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs text-mist-500">
            <Loader2 size={12} className="animate-spin text-sage-300" aria-hidden="true" />
            {t("insights.orphans.looking")}
          </span>
        ) : report ? (
          <span className="font-mono text-xs text-mist-500">
            {t("insights.orphans.examined", { count: report.examined })}
          </span>
        ) : null}
      </div>

      {error && <p className="mt-3 font-mono text-[11px] leading-5 text-coral-300">{error}</p>}

      {report && (
        <>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-mist-300">
              {report.orphans.length > 0 ? (
                <Trans
                  i18nKey="insights.orphans.found"
                  values={{ size: formatBytes(report.bytes) }}
                  components={{ size: <span className="font-mono font-semibold text-sage-300" /> }}
                />
              ) : (
                t("insights.orphans.none")
              )}
            </p>
            {report.orphans.length > 0 && (
              <span className="font-mono text-xs font-bold text-sage-300 shrink-0">
                {formatBytes(report.bytes)}
              </span>
            )}
          </div>

          {report.orphans.length > 0 && (
            <>
              <ul className="mt-3 divide-y divide-forest-800">
                {report.orphans.map((orphan) => (
                  <li key={orphan.path}>
                    <button
                      type="button"
                      onClick={() => onReveal(orphan.path)}
                      title={t("insights.orphans.reveal", { path: orphan.path })}
                      className="group flex w-full items-center justify-between gap-4 py-2.5 px-1 rounded-lg transition-colors hover:bg-forest-850/30 cursor-pointer text-start"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FolderSearch
                          size={13}
                          className="shrink-0 text-mist-500 group-hover:text-sage-300 transition-colors"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <span className="block truncate font-mono text-xs font-medium text-mist-100 group-hover:text-sage-300 transition-colors">
                            {orphan.parent}
                          </span>
                          <span className="mt-0.5 block font-mono text-[10px] text-mist-500">
                            {orphan.label}
                            {!orphan.regenerable && (
                              <span className="text-amber-300"> · {t("insights.orphans.cannotRebuild")}</span>
                            )}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-bold text-mist-100">
                        {orphan.bytes === null ? t("insights.orphans.unreadable") : formatBytes(orphan.bytes)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-3 grid gap-2 border-t border-forest-800 pt-3 text-[11px] leading-relaxed text-mist-500">
                <p>{t("insights.orphans.note")}</p>
                {report.orphans.some((orphan) => !orphan.regenerable) && (
                  <p>{t("insights.orphans.exception")}</p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
