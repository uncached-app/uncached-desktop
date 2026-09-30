import { Check, FolderGit2, Loader2, Play, ShieldAlert, Sparkles } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { MaintenancePreview, SkipReason } from "../../types/maintenance";
import { formatBytes } from "../../utils/format.mjs";

export type RunState =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number }
  | { kind: "done"; removed: number; freedBytes: number; failed: number }
  | { kind: "failed"; message: string };

/**
 * What the policy selects, and — on Pro, with an active scan — the run execution.
 */
export function Selection({
  preview,
  proEnabled,
  canRun,
  settling = false,
  run,
  onRun,
  onShowProtected,
  onExclude,
}: {
  preview: MaintenancePreview;
  proEnabled: boolean;
  canRun: boolean;
  settling?: boolean;
  run: RunState;
  onRun: () => void;
  onShowProtected: (() => void) | null;
  /** Keeps a project out of every run; absent where exclusions are not offered. */
  onExclude?: (path: string) => void;
}) {
  const { t } = useTranslation();
  const selected = preview.selected;
  const running = run.kind === "running";

  const skippedReasons = [...preview.skipped.reduce((counts, entry) => {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
    return counts;
  }, new Map<SkipReason, number>())].sort((left, right) => right[1] - left[1]);

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-forest-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-mist-100">
              {selected.length === 0
                ? t("maintenance.selection.emptyTitle")
                : t("maintenance.selection.readyTitle", { total: selected.length })}
            </h2>
            {settling && (
              <span className="font-mono text-[10px] text-mist-500">
                {t("maintenance.selection.evaluating")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-mist-500">
            {selected.length === 0
              ? t("maintenance.selection.emptyHint")
              : t("maintenance.selection.readyHint")}
          </p>
        </div>

        {selected.length > 0 && (
          <span className="font-mono text-xs font-bold text-sage-300">
            {t("maintenance.selection.reclaimable", { size: formatBytes(preview.bytes) })}
          </span>
        )}
      </div>

      {/* Flat List (NO nested card box!) */}
      {selected.length > 0 ? (
        <ul className="divide-y divide-forest-800">
          {selected.map((entry) => (
            <li
              key={entry.path}
              className="group flex items-center justify-between gap-4 py-2.5 px-1 rounded-lg transition-colors hover:bg-forest-850/30"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <FolderGit2 size={15} className="shrink-0 text-mist-500" aria-hidden="true" />
                <div className="min-w-0">
                  <span className="block truncate font-mono text-xs font-semibold text-mist-100 group-hover:text-sage-300 transition-colors">
                    {entry.name}
                  </span>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-mist-500">
                    <span>{t("maintenance.selection.idle", { count: entry.idleDays })}</span>
                    <span className="inline-flex items-center gap-0.5 text-sage-300">
                      <Check size={10} />
                      <span>{t("maintenance.selection.remoteSynced")}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {onExclude && (
                  <button
                    type="button"
                    onClick={() => onExclude(entry.path)}
                    aria-label={t("maintenance.selection.excludeLabel", { name: entry.name })}
                    className="rounded-md px-2 py-1 text-[11px] font-medium text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100"
                  >
                    {t("maintenance.selection.exclude")}
                  </button>
                )}
                <span className="font-mono text-xs font-bold text-mist-100">
                  {formatBytes(entry.bytes)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2.5 py-4 text-xs text-mist-300">
          <Sparkles size={16} className="shrink-0 text-sage-300" aria-hidden="true" />
          <span>{t("maintenance.selection.clean")}</span>
        </div>
      )}

      {/* Skip Reasons Breakdown (Flat tag metadata) */}
      {skippedReasons.length > 0 && (
        <div className="border-t border-forest-800 pt-3 text-xs text-mist-500 flex flex-wrap items-center gap-1.5">
          <span className="text-mist-500">{t("maintenance.selection.filteredOut")}</span>
          {skippedReasons.map(([reason, count]) => (
            <span
              key={reason}
              className="inline-flex items-center gap-1 rounded-md bg-forest-850 px-2 py-0.5 font-mono text-[11px] text-mist-300"
            >
              <Trans
                i18nKey={`maintenance.selection.skipped.${reason}`}
                values={{ total: count }}
                components={{ strong: <strong className="text-mist-100" /> }}
              />
            </span>
          ))}
        </div>
      )}

      {/* Protected repositories note */}
      {preview.protectedCount > 0 && (
        <ProtectedNote count={preview.protectedCount} onShow={onShowProtected} />
      )}

      {/* Execution and results */}
      {proEnabled && (selected.length > 0 || run.kind === "done" || run.kind === "failed") && (
        <div className="mt-4 border-t border-forest-800 pt-3.5">
          {selected.length > 0 &&
            (canRun ? (
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onRun}
                    disabled={running}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-xl bg-sage-400 hover:bg-sage-300 text-forest-950 px-4 text-xs font-semibold shadow-sm transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    {running ? (
                      <Loader2 size={13} className="animate-spin text-forest-950" aria-hidden="true" />
                    ) : (
                      <Play size={13} aria-hidden="true" />
                    )}
                    <span>
                      {run.kind === "running" && run.total > 0
                        ? t("maintenance.selection.running", { done: run.done, total: run.total })
                        : t("maintenance.selection.run", { total: selected.length })}
                    </span>
                  </button>
                  {run.kind === "idle" && (
                    <span className="text-xs text-mist-500">
                      {t("maintenance.selection.runHint")}
                    </span>
                  )}
                </div>

                {/* Real-time progress bar when running */}
                {run.kind === "running" && run.total > 0 && (
                  <div className="mt-3 w-full max-w-xs">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-forest-850">
                      <div
                        className="h-full rounded-full bg-sage-400 transition-all duration-300"
                        style={{ width: `${Math.max(5, Math.round((run.done / run.total) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs leading-5 text-mist-500">
                {t("maintenance.selection.scanToEnable")}
              </p>
            ))}

          {/* Feedback messages without heavy nested boxes */}
          {run.kind === "done" && (
            <p className="mt-2 text-xs font-medium text-sage-300">
              {t(
                run.failed > 0
                  ? "maintenance.selection.doneWithFailures"
                  : "maintenance.selection.done",
                { count: run.removed, size: formatBytes(run.freedBytes), failed: run.failed },
              )}
            </p>
          )}

          {run.kind === "failed" && (
            <p className="mt-2 text-xs font-medium text-coral-300">
              ✕ {run.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ProtectedNote({ count, onShow }: { count: number; onShow: (() => void) | null }) {
  const { t } = useTranslation();
  const text = t("maintenance.selection.protected", { count });

  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-coral-300">
      <div className="flex items-center gap-1.5">
        <ShieldAlert size={14} className="shrink-0 text-coral-300" aria-hidden="true" />
        <span>{text}</span>
      </div>
      {onShow && (
        <button
          type="button"
          onClick={onShow}
          className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80 cursor-pointer"
        >
          {t("maintenance.selection.viewInWorkspace")}
        </button>
      )}
    </div>
  );
}
