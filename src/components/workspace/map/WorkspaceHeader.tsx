import { ArrowRight, Command, RefreshCw, Search, X } from "lucide-react";
import type { RefObject } from "react";
import { commandKeyLabel } from "./naming";
import { formatBytes } from "../../../utils/format";
import type { CleanupTotals, WorkspaceChange } from "../../../hooks/useWorkspaceHistory";

/** What the workspace adds up to, and the two ways to narrow or act on it. */
export function WorkspaceHeader({
  projectCount,
  totalBytes,
  reclaimableBytes,
  measuring,
  atRisk,
  targetCount,
  onReclaim,
  change,
  reclaimed,
  query,
  onQueryChange,
  searchRef,
  onOpenPalette,
}: {
  projectCount: number;
  totalBytes: number;
  reclaimableBytes: number;
  measuring: boolean;
  /** Counted over the whole index, never over what is on screen. */
  atRisk: number;
  targetCount: number;
  onReclaim: () => void;
  change: WorkspaceChange | null;
  reclaimed: CleanupTotals | null;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onOpenPalette: () => void;
}) {
  return (
    // `pr-1.5` matches the scrollbar gutter the list below reserves, so the
    // search field and the cards end on the same edge.
    <header className="shrink-0 border-b border-forest-800 pr-1.5 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
          <h1 id="workspace-title" className="text-2xl font-semibold tracking-[-0.045em] text-mist-100">
            {projectCount} {projectCount === 1 ? "project" : "projects"}
          </h1>
          <Portrait value={formatBytes(totalBytes)} label="on disk" />
          {reclaimableBytes > 0 ? (
            <Portrait value={formatBytes(reclaimableBytes)} label="reclaimable" accent />
          ) : (
            <span className="flex items-baseline text-sm font-semibold text-sage-300">Nothing to reclaim</span>
          )}
          {measuring && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-mist-500">
              <RefreshCw size={11} className="animate-spin" /> measuring
            </span>
          )}
        </div>

        {/* Sage, not coral: pressing this destroys nothing, it opens the list
            where deletion is chosen. The target count is what should pull the
            user through, not an alarm colour on a link. */}
        {targetCount > 0 && (
          <button
            type="button"
            onClick={onReclaim}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-sage-400 px-4 text-sm font-semibold text-forest-950 transition-colors hover:bg-sage-300"
          >
            Reclaim disk
            <span className="font-mono text-xs opacity-80">{targetCount}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      <HistoryLine change={change} reclaimed={reclaimed} />

      {atRisk > 0 && (
        <p className="mt-2 text-sm font-medium text-coral-300">
          {atRisk === 1 ? "1 project holds work" : `${atRisk} projects hold work`} that exists only on this
          disk.
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-forest-800 bg-forest-900 px-3 py-2.5 transition-colors focus-within:border-sage-400">
          <Search size={15} className="shrink-0 text-mist-500" aria-hidden="true" />
          <span className="sr-only">Filter projects by name, path, kind or branch</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onQueryChange("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Filter by name, path or branch"
            className="min-w-0 flex-1 bg-transparent text-sm text-mist-100 outline-none placeholder:text-mist-500"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear the text filter"
              className="grid size-5 shrink-0 place-items-center rounded-md text-mist-500 hover:bg-forest-800 hover:text-mist-100"
            >
              <X size={13} aria-hidden="true" />
            </button>
          ) : (
            <kbd className="shrink-0 rounded border border-forest-800 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
              /
            </kbd>
          )}
        </label>

        {/* The palette's only advertisement. A shortcut nobody is told about is
            a shortcut nobody uses, and this is the screen where someone is
            already looking at the projects it acts on. */}
        <button
          type="button"
          onClick={onOpenPalette}
          title="Open a project in your editor, terminal or file manager"
          className="flex shrink-0 items-center gap-2 rounded-xl border border-forest-800 bg-forest-900 px-3 py-2.5 text-xs text-mist-500 transition-colors hover:border-sage-400 hover:text-mist-100"
        >
          <Command size={13} aria-hidden="true" />
          Actions
          <kbd className="rounded border border-forest-800 px-1.5 py-0.5 font-mono text-[10px]">
            {commandKeyLabel()}K
          </kbd>
        </button>
      </div>
    </header>
  );
}

/**
 * The one sentence that needs the app to have been here before. A workspace
 * that shrank says so with the same weight as one that grew: reporting only
 * growth would turn a record into a nagging device.
 */
function HistoryLine({
  change,
  reclaimed,
}: {
  change: WorkspaceChange | null;
  reclaimed: CleanupTotals | null;
}) {
  const lifetime = reclaimed && reclaimed.allTimeBytes > 0 ? reclaimed : null;
  if (!change && !lifetime) return null;

  const grew = change ? change.totalDelta > 0 : false;
  const moved = change && change.totalDelta !== 0;

  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist-500">
      {change && (
        <span>
          {moved ? (
            <>
              <span className={`font-mono ${grew ? "text-mist-100" : "text-sage-300"}`}>
                {grew ? "+" : "−"}
                {formatBytes(Math.abs(change.totalDelta))}
              </span>{" "}
              since your last visit
            </>
          ) : (
            <>Unchanged since your last visit</>
          )}
          {change.projectsAdded > 0 && `, ${change.projectsAdded} new`}
        </span>
      )}
      {lifetime && (
        <span>
          <span className="font-mono text-sage-300">{formatBytes(lifetime.allTimeBytes)}</span> reclaimed with
          Uncached
        </span>
      )}
    </p>
  );
}

function Portrait({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-mono text-lg font-semibold ${accent ? "text-sage-300" : "text-mist-100"}`}>
        {value}
      </span>
      <span className="text-[11px] text-mist-500">{label}</span>
    </span>
  );
}
