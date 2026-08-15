import { AlertTriangle, ArrowDownWideNarrow, ArrowRight, Command, RefreshCw, Search, ShieldCheck, Sparkles, X } from "lucide-react";
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
  order,
  onOrderChange,
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
  order: "verdict" | "size";
  onOrderChange: (order: "verdict" | "size") => void;
  onOpenPalette: () => void;
}) {
  return (
    // `pr-1.5` matches the scrollbar gutter the list below reserves, so the
    // search field and the cards end on the same edge.
    <header className="shrink-0 border-b border-forest-800 pb-4">
      {/* Top summary row: Project count, metrics cluster and Primary Reclaim CTA */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <h1 id="workspace-title" className="shrink-0 text-xl font-bold tracking-tight text-mist-100 sm:text-2xl mr-1">
            {projectCount} {projectCount === 1 ? "project" : "projects"}
          </h1>

          <div className="flex flex-wrap items-center gap-2">
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
        </div>

        {/* Primary Reclaim CTA - Firmly pinned to top-right with high contrast */}
        <div className="shrink-0 flex items-center justify-end">
          {targetCount > 0 && (
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
          )}
        </div>
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

        {/* Order Segmented Control */}
        <div className="flex shrink-0 items-center rounded-xl border border-forest-800 bg-forest-900 p-0.5 shadow-xs">
          <button
            type="button"
            onClick={() => onOrderChange("verdict")}
            aria-pressed={order === "verdict"}
            title="Group projects by safety verdict"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-xs font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage-400 ${
              order === "verdict"
                ? "bg-forest-800 text-mist-100 font-semibold shadow-xs border border-forest-750"
                : "text-mist-500 hover:bg-forest-850 hover:text-mist-100"
            }`}
          >
            <ShieldCheck size={12} className={order === "verdict" ? "text-sage-300" : "text-mist-500"} aria-hidden="true" />
            <span>Verdict</span>
          </button>
          <button
            type="button"
            onClick={() => onOrderChange("size")}
            aria-pressed={order === "size"}
            title="Sort projects by total size on disk"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-xs font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage-400 ${
              order === "size"
                ? "bg-forest-800 text-mist-100 font-semibold shadow-xs border border-forest-750"
                : "text-mist-500 hover:bg-forest-850 hover:text-mist-100"
            }`}
          >
            <ArrowDownWideNarrow size={12} className={order === "size" ? "text-sage-300" : "text-mist-500"} aria-hidden="true" />
            <span>Size</span>
          </button>
        </div>

        {/* Actions Button */}
        <button
          type="button"
          onClick={onOpenPalette}
          title="Open a project in your editor, terminal or file manager"
          className="flex shrink-0 items-center gap-2 rounded-xl border border-forest-800 bg-forest-900 px-3 py-2 text-xs font-medium text-mist-300 shadow-xs transition-all hover:border-forest-750 hover:bg-forest-850 hover:text-mist-100 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage-400"
        >
          <Command size={13} className="text-mist-500" aria-hidden="true" />
          <span>Actions</span>
          <kbd className="rounded border border-forest-800 bg-forest-950 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
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

function StatCard({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div
      className={`inline-flex items-baseline gap-1.5 rounded-xl border px-3 py-1.5 ${accent
        ? "border-sage-400/40 bg-sage-400/10 text-sage-300"
        : "border-forest-800 bg-forest-900 text-mist-100"
        }`}
    >
      <span className="font-mono text-sm font-semibold tracking-tight">{value}</span>
      <span className={`text-[11px] ${accent ? "text-sage-300/80 font-medium" : "text-mist-500"}`}>{label}</span>
    </div>
  );
}
