import { Boxes, Info, Package } from "lucide-react";
import { Panel } from "./panels";
import { formatBytes } from "../../../utils/format.mjs";
import type { DuplicatePackage } from "../../../types/duplicates";

/**
 * Packages this project keeps its own copy of, that other projects also keep.
 *
 * Clean, unified list layout matching the rest of the app with zero nested card clutter.
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
  if (packages.length === 0) {
    return running ? (
      <Panel title="Shared With Other Projects">
        <p className="text-xs text-mist-500">Reading what other projects have installed...</p>
      </Panel>
    ) : null;
  }

  const wasted = packages.reduce((sum, entry) => sum + entry.wastedBytes, 0);

  return (
    <Panel
      title="Shared With Other Projects"
      action={
        <span className="inline-flex items-center gap-1 rounded-md bg-forest-850 px-2 py-0.5 font-mono text-[10px] font-medium text-mist-300">
          <Boxes size={11} className="text-sage-300" aria-hidden="true" />
          {packages.length} {packages.length === 1 ? "package" : "packages"}
        </span>
      }
    >
      <div className="space-y-3">
        <p className="text-xs leading-5 text-mist-500">
          Installed here and in other projects, each keeping its own copy.{" "}
          {wasted > 0 && (
            <>
              Across the workspace that is{" "}
              <strong className="font-mono font-semibold text-sage-300">{formatBytes(wasted)}</strong> held
              more than once.
            </>
          )}
        </p>

        {/* Clean, unified list container (no nested individual card boxes) */}
        <div className="overflow-hidden rounded-xl border border-forest-800 bg-forest-950/60">
          <ul className="divide-y divide-forest-800/60">
            {packages.map((entry) => (
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
                    in {entry.copies} {entry.copies === 1 ? "project" : "projects"}
                  </span>
                  {entry.bytesEach !== null && (
                    <span className="min-w-14 text-right font-mono text-xs font-semibold text-mist-100">
                      {formatBytes(entry.bytesEach)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 text-[11px] leading-5 text-mist-500">
          <Info size={12} className="shrink-0 text-mist-500" aria-hidden="true" />
          <p>
            Packages cannot be removed individually without breaking installs. Clean the parent directory in
            the Artifacts list below to reclaim space.
          </p>
        </div>
      </div>
    </Panel>
  );
}
