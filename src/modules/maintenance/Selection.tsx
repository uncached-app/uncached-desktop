import { Check, FolderGit2, Loader2, Play, ShieldAlert, Sparkles } from "lucide-react";
import type { MaintenancePreview, SkipReason } from "../../types/maintenance";
import { formatBytes } from "../../utils/format";

const SKIP_REASONS: Record<SkipReason, string> = {
  verdict: "not safe to automate",
  unmeasured: "not measured yet",
  unknownActivity: "activity unreadable",
  tooRecent: "recently active",
  tooSmall: "below size floor",
};

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
}: {
  preview: MaintenancePreview;
  proEnabled: boolean;
  canRun: boolean;
  settling?: boolean;
  run: RunState;
  onRun: () => void;
  onShowProtected: (() => void) | null;
}) {
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
                ? "No Projects Match This Rule"
                : `Ready for Maintenance (${selected.length})`}
            </h2>
            {settling && (
              <span className="font-mono text-[10px] text-mist-500">
                (evaluating...)
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-mist-500">
            {selected.length === 0
              ? "All workspace projects are either recently active, below the size floor, or protected."
              : "Reclaiming targets moves them reversibly to the Recycle Bin."}
          </p>
        </div>

        {selected.length > 0 && (
          <span className="font-mono text-xs font-bold text-sage-300">
            {formatBytes(preview.bytes)} reclaimable
          </span>
        )}
      </div>

      {/* Flat List (NO nested card box!) */}
      {selected.length > 0 ? (
        <ul className="divide-y divide-forest-800">
          {selected.map((entry) => (
            <li key={entry.path} className="flex items-center justify-between gap-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <FolderGit2 size={15} className="shrink-0 text-mist-500" aria-hidden="true" />
                <div className="min-w-0">
                  <span className="block truncate font-mono text-xs font-semibold text-mist-100">
                    {entry.name}
                  </span>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-mist-500">
                    <span>idle {entry.idleDays} days</span>
                    <span className="inline-flex items-center gap-0.5 text-sage-300">
                      <Check size={10} />
                      <span>Remote synced</span>
                    </span>
                  </div>
                </div>
              </div>

              <span className="shrink-0 font-mono text-xs font-bold text-mist-100">
                {formatBytes(entry.bytes)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2.5 py-4 text-xs text-mist-300">
          <Sparkles size={16} className="shrink-0 text-sage-300" aria-hidden="true" />
          <span>Your workspace is clean. No dormant projects meet the threshold.</span>
        </div>
      )}

      {/* Skip Reasons Breakdown (Flat text metadata) */}
      {skippedReasons.length > 0 && (
        <div className="border-t border-forest-800 pt-3 text-xs text-mist-500 flex flex-wrap items-center gap-2">
          <span>Filtered out:</span>
          {skippedReasons.map(([reason, count]) => (
            <span key={reason} className="font-mono text-[11px] text-mist-300">
              <strong>{count}</strong> {SKIP_REASONS[reason]}
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
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onRun}
                  disabled={running}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-xl bg-sage-300 hover:bg-sage-300/90 text-white dark:bg-sage-400 dark:text-forest-950 px-4 text-xs font-semibold shadow-sm transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {running ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Play size={13} aria-hidden="true" />
                  )}
                  <span>
                    {run.kind === "running" && run.total > 0
                      ? `Reclaiming ${run.done} of ${run.total}...`
                      : `Run Maintenance (${selected.length})`}
                  </span>
                </button>
                {run.kind === "idle" && (
                  <span className="text-xs text-mist-500">
                    Moves selected targets to the Recycle Bin.
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs leading-5 text-mist-500">
                Scan your workspace to enable one-click maintenance on identified targets.
              </p>
            ))}

          {/* Feedback messages without heavy nested boxes */}
          {run.kind === "done" && (
            <p className="mt-2 text-xs font-medium text-sage-300">
              ✓ Reclaimed {formatBytes(run.freedBytes)} from {run.removed}{" "}
              {run.removed === 1 ? "target" : "targets"}
              {run.failed > 0 && ` (${run.failed} failed)`}.
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
  const text =
    count === 1
      ? "1 project holds uncommitted/unpushed work on this disk (Protected)"
      : `${count} projects hold uncommitted/unpushed work on this disk (Protected)`;

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
          className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80"
        >
          View in workspace &rarr;
        </button>
      )}
    </div>
  );
}
