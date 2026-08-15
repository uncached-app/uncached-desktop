import { Copy, Layers, Link2, Loader2 } from "lucide-react";
import type { DuplicateReport } from "../../types/duplicates";
import { formatBytes } from "../../utils/format";

/** How many rows a Free reader gets. The total is never one of the hidden ones. */
const FREE_ROWS = 3;

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
}: {
  report: DuplicateReport | null;
  running: boolean;
  error: string | null;
  proEnabled: boolean;
}) {
  const rows = report ? (proEnabled ? report.packages : report.packages.slice(0, FREE_ROWS)) : [];
  const hidden = report && !proEnabled ? Math.max(0, report.packages.length - FREE_ROWS) : 0;

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-mist-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-mist-100">
            Duplicate dependencies
          </h2>
        </div>

        {running ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs text-mist-500">
            <Loader2 size={12} className="animate-spin text-sage-300" aria-hidden="true" />
            Reading
          </span>
        ) : report ? (
          <span className="font-mono text-xs text-mist-500">
            {report.distinctPackages} distinct {report.distinctPackages === 1 ? "package" : "packages"}
          </span>
        ) : null}
      </div>

      {error && <p className="mt-3 font-mono text-[11px] leading-5 text-coral-300">{error}</p>}

      {report && (
        <>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-mist-300">
              {report.wastedBytes > 0 ? (
                <>
                  <span className="font-mono font-semibold text-sage-300">{formatBytes(report.wastedBytes)}</span>{" "}
                  held in identical copies across projects
                </>
              ) : (
                "Nothing is duplicated across your projects."
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
              {rows.map((entry) => (
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
                        {entry.copies} {entry.copies === 1 ? "project" : "projects"}
                        {entry.bytesEach !== null && ` · ${formatBytes(entry.bytesEach)} each`}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-bold text-mist-100">
                    {formatBytes(entry.wastedBytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {hidden > 0 && (
            <p className="mt-3 border-t border-forest-800 pt-3 text-xs text-mist-500">
              {hidden} more {hidden === 1 ? "package is" : "packages are"} duplicated. Pro lists them.
            </p>
          )}

          {report.sharedProjects > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-sage-300">
              <Link2 size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {report.sharedProjects}{" "}
                {report.sharedProjects === 1 ? "project already links" : "projects already link"} their
                packages into a shared store instead of copying them.
              </span>
            </p>
          )}

          {report.packages.length > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-mist-500">
              One copy of each package is measured and the rest is arithmetic. Packages with native
              compiled binaries may vary across projects.
            </p>
          )}
        </>
      )}
    </div>
  );
}
