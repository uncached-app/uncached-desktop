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
  projectCount,
  proEnabled,
  onScan,
}: {
  report: DuplicateReport | null;
  running: boolean;
  error: string | null;
  projectCount: number;
  proEnabled: boolean;
  onScan: () => void;
}) {
  const rows = report ? (proEnabled ? report.packages : report.packages.slice(0, FREE_ROWS)) : [];
  const hidden = report && !proEnabled ? Math.max(0, report.packages.length - FREE_ROWS) : 0;

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-mist-100">
            <Layers size={15} className="text-mist-500" aria-hidden="true" />
            Duplicate dependencies
          </h2>
          <p className="mt-0.5 text-xs text-mist-500">
            {report
              ? `${report.distinctPackages} distinct packages across ${report.scannedProjects} ${report.scannedProjects === 1 ? "project" : "projects"}.`
              : "Reads every node_modules in your workspace. Nothing is moved or removed."}
          </p>
        </div>

        <button
          type="button"
          onClick={onScan}
          disabled={running || projectCount === 0}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-forest-800 bg-forest-950 px-3.5 text-xs font-semibold text-mist-100 transition-colors hover:bg-forest-850 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
          <span>{running ? "Reading" : report ? "Read again" : "Find duplicates"}</span>
        </button>
      </div>

      {error && <p className="mt-3 font-mono text-[11px] leading-5 text-coral-300">{error}</p>}

      {report && (
        <>
          <p className="mt-4 text-sm font-semibold text-mist-100">
            {report.wastedBytes > 0 ? (
              <>
                <span className="font-mono text-sage-300">{formatBytes(report.wastedBytes)}</span>{" "}
                held in identical copies
              </>
            ) : (
              "Nothing is duplicated across your projects"
            )}
          </p>

          {rows.length > 0 && (
            <ul className="mt-3 divide-y divide-forest-800">
              {rows.map((entry) => (
                <li
                  key={`${entry.name}@${entry.version}`}
                  className="flex items-center justify-between gap-4 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Copy size={13} className="shrink-0 text-mist-500" aria-hidden="true" />
                    <div className="min-w-0">
                      <span className="block truncate font-mono text-xs text-mist-100">
                        {entry.name}
                        <span className="text-mist-500">@{entry.version}</span>
                      </span>
                      <span className="mt-0.5 block text-[10px] text-mist-500">
                        {entry.copies} projects
                        {entry.bytesEach !== null && ` · ${formatBytes(entry.bytesEach)} each`}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold text-mist-100">
                    {formatBytes(entry.wastedBytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {hidden > 0 && (
            <p className="mt-3 border-t border-forest-800 pt-3 text-xs text-mist-500">
              {hidden} more {hidden === 1 ? "package is" : "packages are"} duplicated. Pro lists
              them.
            </p>
          )}

          {/* The one number here that is not measured, said out loud. Two
              directories with the same name@version came from the same
              published tarball — but a postinstall that compiled a native
              binary can still make them differ. */}
          {report.packages.length > 0 && (
            <p className="mt-3 text-[11px] leading-5 text-mist-500">
              One copy of each package is measured and the rest is arithmetic, so this is an
              estimate. A package whose install step compiled something may not be identical across
              projects.
            </p>
          )}

          {report.sharedProjects > 0 && (
            <p className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-sage-300">
              <Link2 size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              {report.sharedProjects}{" "}
              {report.sharedProjects === 1 ? "project already links" : "projects already link"} their
              packages into a shared store instead of copying them, and{" "}
              {report.sharedProjects === 1 ? "is" : "are"} not counted above.
            </p>
          )}
        </>
      )}
    </div>
  );
}
