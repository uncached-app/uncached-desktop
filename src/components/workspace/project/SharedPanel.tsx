import { Boxes, Package } from "lucide-react";
import { Panel } from "./panels";
import { formatBytes } from "../../../utils/format.mjs";
import type { DuplicatePackage } from "../../../types/duplicates";

/**
 * Packages this project keeps its own copy of, that other projects also keep.
 *
 * The map made this visible and the project page did not, which had it exactly
 * backwards: the map answers "where is the duplication in this workspace" and
 * the page answers "what is in front of me". Someone looking at one project and
 * deciding what to do with 900 MB of `node_modules` is the reader who most
 * needs to know that 600 MB of it exists eleven times over.
 *
 * Read-only, like every duplicate reading in the product. Removing one copy of
 * a package from one project is not a cleanup, it is a broken install; what
 * this leads to is the whole directory, which the artifact list below already
 * offers.
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
        <p className="text-xs text-mist-500">Reading what the other projects have installed...</p>
      </Panel>
    ) : null;
  }

  const wasted = packages.reduce((sum, entry) => sum + entry.wastedBytes, 0);

  return (
    <Panel
      title="Shared With Other Projects"
      action={
        <span className="inline-flex items-center gap-1 rounded-md bg-forest-850 px-2 py-0.5 font-mono text-[10px] font-medium text-mist-300">
          <Boxes size={10} aria-hidden="true" />
          {packages.length}
        </span>
      }
    >
      <div className="space-y-3">
        <p className="text-xs leading-5 text-mist-500">
          Installed here and in other projects, each keeping its own copy.{" "}
          {wasted > 0 && (
            <>
              Across the workspace that is{" "}
              <strong className="font-semibold text-mist-300">{formatBytes(wasted)}</strong> held more
              than once.
            </>
          )}
        </p>

        <ul className="grid gap-1.5">
          {packages.map((entry) => (
            <li
              key={`${entry.name}@${entry.version}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-forest-800 bg-forest-950 px-3.5 py-2"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Package size={13} className="shrink-0 text-mist-500" aria-hidden="true" />
                <span className="truncate font-mono text-xs text-mist-300">{entry.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-mist-500">{entry.version}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-[11px] text-mist-500">
                  in {entry.copies} {entry.copies === 1 ? "project" : "projects"}
                </span>
                {entry.bytesEach !== null && (
                  <span className="font-mono text-[11px] font-medium text-mist-100">
                    {formatBytes(entry.bytesEach)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>

        <p className="text-[11px] leading-5 text-mist-500">
          Nothing here is removed on its own — a package taken out of one project is a broken
          install, not a reclaim. The directory holding them is in the list below.
        </p>
      </div>
    </Panel>
  );
}
