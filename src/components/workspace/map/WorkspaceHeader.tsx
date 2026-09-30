import { AlertTriangle, ArrowRight, ArrowUpDown, FolderOpen, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useState, type RefObject } from "react";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes } from "../../../utils/format.mjs";
import { Select } from "../../shared/Select";
import { StatCard } from "../../shared/StatCard";
import { ActionButton } from "../../shared/ActionButton";
import { FolderMenu, type FolderAnchor } from "../../shared/FolderMenu";
import { rootName } from "./naming";
import type { WorkspaceChange } from "../../../hooks/useWorkspaceHistory";

/** What the workspace adds up to, and the two ways to narrow or act on it. */
export function WorkspaceHeader({
  projectCount,
  totalBytes,
  reclaimableBytes,
  atRisk,
  onShowAtRisk,
  targetCount,
  onReclaim,
  change,
  reclaimedBytes,
  query,
  onQueryChange,
  searchRef,
  order,
  onOrderChange,
  hasFamilies,
  active,
  onClearAll,
  sidebarCollapsed = false,
  onToggleSidebar,
  folder,
  onFolderResult,
  onRescan,
}: {
  projectCount: number;
  totalBytes: number;
  reclaimableBytes: number;
  /** Counted over the whole index, never over what is on screen. */
  atRisk: number;
  /** Narrows the list to the projects holding work that exists only on this disk. */
  onShowAtRisk: () => void;
  /** Null until the artifact walk has been run for these folders. */
  targetCount: number | null;
  onReclaim: () => void;
  change: WorkspaceChange | null;
  reclaimedBytes: number | null;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  order: "verdict" | "size" | "folder";
  onOrderChange: (order: "verdict" | "size" | "folder") => void;
  /** Only offered when something here actually shares a directory. */
  hasFamilies: boolean;
  /**
   * What is narrowing the list right now, and how to stop it.
   *
   * The bar had no idea. Four of a hundred and forty projects on screen, the
   * sidebar holding three filters, and the field still reading "Filter by name,
   * path, ecosystem or branch" — state that is on and not shown, which is the
   * failure this app corrects everywhere else. Clearing lived in the empty
   * state, reachable only once nothing was left.
   */
  active: Array<{ id: string; label: string; onClear: () => void }>;
  onClearAll: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  /**
   * The folder these shortcuts mean, or null when there is no single answer.
   *
   * With several folders chosen and none selected in the sidebar, an icon
   * saying "open a terminal" would have to guess which one — so it is not
   * drawn. The sidebar is where a folder stops being ambiguous, and each row
   * there carries the same verbs on a right-click.
   */
  folder: string | null;
  onFolderResult: (message: string | null) => void;
  onRescan: () => void;
}) {
  const { t } = useTranslation();

  return (
    // `pe-2` matches the scrollbar gutter the list below reserves, so the
    // search field and the cards end on the same edge.
    <header className="shrink-0 border-b border-forest-800 pb-4 pe-2">
      {/* Row 1: sidebar toggle, what this screen is, and how to reach the
          folder it is about */}
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
            title={sidebarCollapsed ? t("workspace.header.showFilters") : t("workspace.header.hideFilters")}
            aria-label={sidebarCollapsed ? t("workspace.header.showFilters") : t("workspace.header.hideFilters")}
            aria-pressed={!sidebarCollapsed}
            className="-ms-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}

        <h1 id="workspace-title" className="text-xl font-bold tracking-tight text-mist-100 sm:text-2xl">
          {t("workspace.header.projects", { count: projectCount })}
        </h1>

        {/* Above the reclaim button rather than beside it. These leave the app
            and cost nothing; that one empties directories. Ranking them by
            where the eye lands keeps the heavier of the two at the bottom of
            the header, next to the number it is about. */}
        <div className="ms-auto flex shrink-0 flex-wrap items-center gap-1.5">
          {/* Reading the folders again, on demand. The app already does this
              when its window comes back and when the watcher sees the disk
              change; this is for the times you know something happened and
              would rather not wonder whether it was noticed. */}
          <ActionButton
            icon={RefreshCw}
            label={t("workspace.header.rescan")}
            onClick={onRescan}
            align="right"
          />
          <FolderShortcuts folder={folder} onResult={onFolderResult} />
        </div>
      </div>

      {/* Row 2: what the workspace measures, and the one button that changes it */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <StatCard value={formatBytes(totalBytes)} label={t("workspace.header.onDisk")} />

          {reclaimableBytes > 0 && (
            <StatCard
              value={formatBytes(reclaimableBytes)}
              label={t("workspace.header.reclaimable")}
              accent
            />
          )}

          {atRisk > 0 && (
            <button
              type="button"
              onClick={onShowAtRisk}
              title={t("workspace.header.atRiskTitle", { count: atRisk })}
              aria-label={t("workspace.header.atRiskShow", { count: atRisk })}
              className="inline-flex cursor-pointer items-baseline gap-1.5 rounded-xl border border-coral-300/30 bg-coral-300/10 px-3 py-1.5 text-coral-300 transition-colors hover:border-coral-300/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-coral-300"
            >
              <AlertTriangle size={13} className="self-center shrink-0" aria-hidden="true" />
              <span className="font-mono text-sm font-semibold tracking-tight">{atRisk}</span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-coral-300/80">{t("workspace.header.atRisk")}</span>
            </button>
          )}

        </div>

        {/* Offered whether or not anything has been counted yet. The count
            arrives from a walk that now only runs because somebody pressed
            this, so gating the button on it would have hidden the one control
            that produces it. */}
        {targetCount !== 0 && (
          <button
            type="button"
            onClick={onReclaim}
            className="group inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sage-400 px-4 text-xs font-semibold text-forest-950 shadow-sm transition-all hover:bg-sage-300 active:scale-[0.99]"
          >
            <span>{t("workspace.header.reclaim")}</span>
            {/* Inverted, not tinted. A translucent wash of the label colour
                moves the chip towards the number written on it, which is the
                one direction that costs contrast — and it widens with the
                count rather than clipping a fourth digit. */}
            {targetCount !== null && (
              <span className="grid h-5 min-w-5 place-items-center rounded bg-forest-950 px-1 font-mono text-[11px] font-bold text-sage-400">
                {targetCount}
              </span>
            )}
            <ArrowRight size={13} className="rtl:-scale-x-100 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <HistoryLine change={change} reclaimedBytes={reclaimedBytes} />

      {/* Filter and Order controls bar - Native Uncached Design Language */}
      <div className="mt-3.5 flex items-center gap-2.5">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-forest-800 bg-forest-900 px-3.5 shadow-2xs transition-all focus-within:border-sage-400/60 focus-within:ring-1 focus-within:ring-sage-400/30">
          <Search size={14} className="shrink-0 text-mist-500" aria-hidden="true" />
          <span className="sr-only">{t("workspace.header.filterLabel")}</span>
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
            placeholder={t("workspace.header.filterPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-xs text-mist-100 outline-none placeholder:text-mist-500"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label={t("workspace.header.clearText")}
              className="grid size-5 shrink-0 place-items-center rounded-md text-mist-500 transition-colors hover:bg-forest-800 hover:text-mist-100 cursor-pointer"
            >
              <X size={13} aria-hidden="true" />
            </button>
          ) : (
            <kbd className="shrink-0 rounded-md border border-forest-800 bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
              /
            </kbd>
          )}
        </label>

        {/* Order Dropdown */}
        <Select
          label={t("workspace.header.order")}
          size="sm"
          icon={<ArrowUpDown size={13} />}
          value={order}
          onChange={(value) => onOrderChange(value as "verdict" | "size" | "folder")}
          options={[
            { value: "verdict", label: t("workspace.header.byVerdict") },
            { value: "size", label: t("workspace.header.bySize") },
            ...(hasFamilies ? [{ value: "folder", label: t("workspace.header.byFolder") }] : []),
          ]}
          className="w-44 shrink-0 shadow-2xs"
        />
      </div>

      {/* Only when something is on, so an untouched screen carries no row for a
          state it is not in. */}
      {active.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pe-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">
            {t("workspace.header.showing")}
          </span>
          {active.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={filter.onClear}
              title={t("workspace.header.stopFiltering", { label: filter.label })}
              className="group inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-forest-800 bg-forest-900 py-1 ps-2.5 pe-1.5 text-[11px] text-mist-300 transition-colors hover:border-sage-400/50 hover:text-mist-100"
            >
              {filter.label}
              <X size={11} className="text-mist-500 group-hover:text-mist-100" aria-hidden="true" />
            </button>
          ))}
          {active.length > 1 && (
            <button
              type="button"
              onClick={onClearAll}
              className="cursor-pointer rounded-lg px-2 py-1 text-[11px] font-medium text-mist-500 transition-colors hover:text-mist-100"
            >
              {t("workspace.header.clearAll")}
            </button>
          )}
        </div>
      )}
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
  reclaimedBytes,
}: {
  change: WorkspaceChange | null;
  reclaimedBytes: number | null;
}) {
  const { t } = useTranslation();
  const lifetime = reclaimedBytes && reclaimedBytes > 0 ? reclaimedBytes : null;
  if (!change && !lifetime) return null;

  const grew = change ? change.totalDelta > 0 : false;
  const moved = change && change.totalDelta !== 0;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist-500">
      {change && (
        <span className="inline-flex items-center gap-1.5">
          {moved ? (
            <span>
              <Trans
                i18nKey="workspace.history.moved"
                values={{ sign: grew ? "+" : "−", size: formatBytes(Math.abs(change.totalDelta)) }}
                components={{
                  delta: <span className={`font-mono font-medium ${grew ? "text-mist-100" : "text-sage-300"}`} />,
                }}
              />
            </span>
          ) : (
            <span>{t("workspace.history.unchanged")}</span>
          )}
          {change.projectsAdded > 0 && (
            <span className="rounded bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-300">
              {t("workspace.history.added", { count: change.projectsAdded })}
            </span>
          )}
        </span>
      )}
      {lifetime && (
        <span className="inline-flex items-center gap-1.5">
          <Sparkles size={11} className="text-sage-300" aria-hidden="true" />
          <span>
            <Trans
              i18nKey="workspace.history.lifetime"
              values={{ size: formatBytes(lifetime) }}
              components={{ size: <span className="font-mono font-medium text-sage-300" /> }}
            />
          </span>
        </span>
      )}
    </div>
  );
}


/**
 * The workspace folder's own verbs, as icons.
 *
 * The same list the folder menu and the palette read, drawn the way the project
 * page draws a project's. Standing in your own workspace directory — a
 * terminal, an editor, the file manager — used to mean leaving for Finder,
 * which is the one gesture that makes an app like this stop being where you
 * work.
 */
/** The chosen folder's verbs, behind one button: the palette and the folder list offer the same ones. */
function FolderShortcuts({
  folder,
  onResult,
}: {
  folder: string | null;
  onResult: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<FolderAnchor | null>(null);
  if (!folder) return null;

  return (
    <>
      <ActionButton
        icon={FolderOpen}
        label={t("workspace.header.openFolder")}
        align="right"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAnchor({ path: folder, name: rootName(folder), x: box.left, y: box.bottom + 6 });
        }}
      />
      {anchor && <FolderMenu anchor={anchor} onResult={onResult} onClose={() => setAnchor(null)} />}
    </>
  );
}
