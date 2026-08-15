import { AlertTriangle, ArrowRight, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Sparkles, X } from "lucide-react";
import type { RefObject } from "react";
import { formatBytes } from "../../../utils/format.mjs";
import { ChoiceRow } from "../../shared/ChoiceRow";
import { StatCard } from "../../shared/StatCard";
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
  order,
  onOrderChange,
  hasFamilies,
  view,
  sidebarCollapsed = false,
  onToggleSidebar,
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
  order: "verdict" | "size" | "folder";
  onOrderChange: (order: "verdict" | "size" | "folder") => void;
  /** Only offered when something here actually shares a directory. */
  hasFamilies: boolean;
  /** Which reading is open. Chosen in Settings, not here. */
  view: "list" | "map";
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  return (
    // `pr-2` matches the scrollbar gutter the list below reserves, so the
    // search field and the cards end on the same edge.
    <header className="shrink-0 border-b border-forest-800 pb-4 pr-2">
      {/* Row 1: Sidebar Toggle and Workspace Title */}
      <div className="flex items-center gap-2 mb-3">
        {/* Bare, and to the left of the count it belongs beside.
            
            A bordered box the size of a button competes with the numbers next
            to it for a control that only folds a column away — the same weight
            as `Reclaim disk`, for none of the consequence. It is an icon until
            the pointer is on it. */}
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? "Show filters" : "Hide filters"}
            aria-label={sidebarCollapsed ? "Show filters" : "Hide filters"}
            aria-pressed={!sidebarCollapsed}
            className="-ml-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}

        <h1 id="workspace-title" className="text-xl font-bold tracking-tight text-mist-100 sm:text-2xl">
          {projectCount} {projectCount === 1 ? "project" : "projects"}
        </h1>
      </div>

      {/* Row 2: Metrics cards on left, Primary Reclaim CTA on right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <StatCard value={formatBytes(totalBytes)} label="on disk" />

          {reclaimableBytes > 0 && (
            <StatCard
              value={formatBytes(reclaimableBytes)}
              label="reclaimable"
              accent
            />
          )}

          {atRisk > 0 && (
            <div
              title={`${atRisk} ${atRisk === 1 ? "project holds" : "projects hold"} unpushed or uncommitted work`}
              className="inline-flex items-baseline gap-1.5 rounded-xl border border-coral-300/30 bg-coral-300/10 px-3 py-1.5 text-coral-300"
            >
              <AlertTriangle size={13} className="self-center shrink-0" aria-hidden="true" />
              <span className="font-mono text-sm font-semibold tracking-tight">{atRisk}</span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-coral-300/80">at risk</span>
            </div>
          )}

          {measuring && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-forest-800 bg-forest-900 px-2.5 py-1.5 font-mono text-[11px] text-mist-500">
              <RefreshCw size={11} className="animate-spin text-sage-300" /> measuring...
            </span>
          )}
        </div>

        {/* Primary Reclaim CTA aligned to the right edge */}
        {targetCount > 0 && (
          <div className="shrink-0 flex items-center justify-end">
            <button
              type="button"
              onClick={onReclaim}
              className="group inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-xl bg-sage-400 hover:bg-sage-300 text-forest-950 px-4 text-xs font-semibold shadow-sm transition-all active:scale-[0.99] cursor-pointer"
            >
              <span>Reclaim disk</span>
              <span className="grid size-4.5 place-items-center rounded bg-forest-950/20 font-mono text-[11px] font-bold text-forest-950">
                {targetCount}
              </span>
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <HistoryLine change={change} reclaimed={reclaimed} />

      {/* Filter, Order and Action controls bar */}
      <div className="mt-3.5 flex items-center gap-2.5">
        <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-forest-800 bg-forest-900 px-3.5 py-2 transition-all focus-within:ring-1 focus-within:ring-sage-400/30">
          <Search size={14} className="shrink-0 text-mist-500" aria-hidden="true" />
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
            placeholder="Filter by name, path, ecosystem or branch"
            className="min-w-0 flex-1 bg-transparent text-xs text-mist-100 outline-none placeholder:text-mist-500"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear the text filter"
              className="grid size-5 shrink-0 place-items-center rounded-md text-mist-500 transition-colors hover:bg-forest-800 hover:text-mist-100 cursor-pointer"
            >
              <X size={13} aria-hidden="true" />
            </button>
          ) : (
            <kbd className="shrink-0 rounded-md border border-forest-800 bg-forest-950 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
              /
            </kbd>
          )}
        </label>

        {/* An order is a property of a list. On the map the same control would
            be pressable and change nothing. */}
        {view === "list" && (
          <ChoiceRow
            active={order}
            onChange={onOrderChange}
            options={[
              ["verdict", "By verdict", "What a project holds decides whether its size is worth acting on"],
              ["size", "By size", "Heaviest on disk first"],
              ...(hasFamilies
                ? ([["folder", "By folder", "Projects that sit in one directory, together"]] as const)
                : []),
            ]}
          />
        )}

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
    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist-500">
      {change && (
        <span className="inline-flex items-center gap-1.5">
          {moved ? (
            <>
              <span className={`font-mono font-medium ${grew ? "text-mist-100" : "text-sage-300"}`}>
                {grew ? "+" : "−"}
                {formatBytes(Math.abs(change.totalDelta))}
              </span>{" "}
              <span>since your last visit</span>
            </>
          ) : (
            <span>Unchanged since your last visit</span>
          )}
          {change.projectsAdded > 0 && (
            <span className="rounded bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-300">
              +{change.projectsAdded} new
            </span>
          )}
        </span>
      )}
      {lifetime && (
        <span className="inline-flex items-center gap-1.5">
          <Sparkles size={11} className="text-sage-300" aria-hidden="true" />
          <span className="font-mono font-medium text-sage-300">{formatBytes(lifetime.allTimeBytes)}</span>
          <span>reclaimed with Uncached</span>
        </span>
      )}
    </div>
  );
}

