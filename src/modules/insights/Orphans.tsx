import { FolderSearch, Ghost, Loader2 } from "lucide-react";
import type { OrphanReport } from "../../types/orphans";
import { formatBytes } from "../../utils/format";

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
  rootCount,
  onScan,
  onReveal,
}: {
  report: OrphanReport | null;
  running: boolean;
  error: string | null;
  rootCount: number;
  onScan: () => void;
  onReveal: (path: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-mist-100">
            <Ghost size={15} className="text-mist-500" aria-hidden="true" />
            Left behind
          </h2>
          <p className="mt-0.5 text-xs text-mist-500">
            {report
              ? `${report.examined} folders examined.`
              : "Looks for build output whose project is gone. Nothing is moved or removed."}
          </p>
        </div>

        <button
          type="button"
          onClick={onScan}
          disabled={running || rootCount === 0}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-forest-800 bg-forest-950 px-3.5 text-xs font-semibold text-mist-100 transition-colors hover:bg-forest-850 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
          <span>{running ? "Looking" : report ? "Look again" : "Find leftovers"}</span>
        </button>
      </div>

      {error && <p className="mt-3 font-mono text-[11px] leading-5 text-coral-300">{error}</p>}

      {report && (
        <>
          <p className="mt-4 text-sm font-semibold text-mist-100">
            {report.orphans.length > 0 ? (
              <>
                <span className="font-mono text-sage-300">{formatBytes(report.bytes)}</span> belongs
                to no project
              </>
            ) : (
              "Every build folder here belongs to a project"
            )}
          </p>

          {report.orphans.length > 0 && (
            <ul className="mt-3 divide-y divide-forest-800">
              {report.orphans.map((orphan) => (
                <li key={orphan.path} className="flex items-center justify-between gap-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onReveal(orphan.path)}
                    title={`Show ${orphan.path} in the file manager`}
                    className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <FolderSearch
                      size={13}
                      className="shrink-0 text-mist-500 group-hover:text-sage-300"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <span className="block truncate font-mono text-xs text-mist-100 group-hover:text-sage-300">
                        {orphan.parent}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-mist-500">
                        {orphan.label}
                        {/* The one kind here that is not disposable because
                            rebuilding is cheap. Said on the row, because "left
                            behind" would otherwise read as "regenerable" and
                            this is the opposite: nothing can reproduce it. */}
                        {!orphan.regenerable && (
                          <span className="text-confidence-medium"> · cannot be rebuilt</span>
                        )}
                      </span>
                    </div>
                  </button>
                  <span className="shrink-0 font-mono text-xs font-semibold text-mist-100">
                    {orphan.bytes === null ? "unreadable" : formatBytes(orphan.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Said out loud rather than left as an absent button. This is the
              one finding the product can see and will not act on, and the
              reason is the property everything else here rests on. */}
          {report.orphans.length > 0 && (
            <div className="mt-3 grid gap-2 border-t border-forest-800 pt-3 text-[11px] leading-5 text-mist-500">
              <p>
                Uncached will not remove these. A build folder is only ever a target when the
                project file that owns it sits beside it, and that is exactly what these are
                missing — the check that keeps a cleanup honest is the same one that stops it here.
                Open one to decide for yourself.
              </p>
              {report.orphans.some((orphan) => !orphan.regenerable) && (
                <p>
                  The environments above are the exception to everything else on this screen:
                  without the project's dependency file, no command can rebuild one. They are dead
                  weight because nothing is left that could use them, not because they are cheap to
                  replace.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
