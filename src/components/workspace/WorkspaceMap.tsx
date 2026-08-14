import { ArrowRight, Command, Copy, FolderOpen, GitBranch, Plus, RefreshCw, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Footprint, Verdict, WorkspaceIndex, WorkspaceProject } from "../../types/workspace";
import { formatBytes } from "../../utils/format";
import type { CleanupTotals, WorkspaceChange } from "../../hooks/useWorkspaceHistory";
import { ProLockButton } from "../shared/ProLockButton";
import { useOpenCommandPalette } from "../../hooks/useCommandPalette";
import { VERDICT_ORDER, VERDICT_PRESENTATION, projectEvidence } from "./verdictPresentation";

type WorkspaceMapProps = {
  index: WorkspaceIndex;
  query: string;
  onQueryChange: (query: string) => void;
  proEnabled: boolean;
  footprints: Record<string, Footprint>;
  measuring: boolean;
  verdicts: Record<string, Verdict>;
  /** Every folder the user chose, including any this plan did not index. */
  chosenRoots: string[];
  onAddRoot: () => void;
  onRemoveRoot: (root: string) => void;
  /** Drops every folder, which leaves nothing to show but the picker. */
  onRemoveAllRoots: () => void;
  /** How many artifacts the same scan found, and where reclaiming them happens. */
  targetCount: number;
  onReclaim: () => void;
  /** Absent until a visit has been recorded, and always absent on Free. */
  change: WorkspaceChange | null;
  reclaimed: CleanupTotals | null;
  /** Lifted so Insights can send the user to a narrowed list. */
  activeVerdict: Verdict | null;
  setActiveVerdict: (verdict: Verdict | null) => void;
};

/** `⌘` where it means something, `Ctrl` where it does not. */
function commandKeyLabel(): string {
  return /Macintosh|Mac OS X/.test(navigator.userAgent) ? "\u2318" : "Ctrl ";
}

function rootName(path: string): string {
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function WorkspaceMap({
  index,
  query,
  onQueryChange,
  proEnabled,
  footprints,
  measuring,
  verdicts,
  chosenRoots,
  onAddRoot,
  onRemoveRoot,
  onRemoveAllRoots,
  targetCount,
  onReclaim,
  change,
  reclaimed,
  activeVerdict,
  setActiveVerdict,
}: WorkspaceMapProps) {
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const openPalette = useOpenCommandPalette();
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLowerCase();

  // Folder and text narrow the set the verdict counts are taken from; the
  // verdict itself does not, so switching between verdicts never moves the
  // numbers the user is choosing from.
  const scoped = useMemo(
    () =>
      index.projects.filter((project) => {
        const matchesRoot = !activeRoot || project.root === activeRoot;
        const haystack = `${project.name} ${project.path} ${project.kind} ${project.git.branch ?? ""}`;
        return matchesRoot && (!normalizedQuery || haystack.toLowerCase().includes(normalizedQuery));
      }),
    [index.projects, normalizedQuery, activeRoot],
  );

  const visible = useMemo(
    () => (activeVerdict ? scoped.filter((project) => (verdicts[project.path] ?? "unknown") === activeVerdict) : scoped),
    [scoped, activeVerdict, verdicts],
  );

  const verdictCounts = useMemo(() => {
    const counts = new Map<Verdict, number>();
    for (const project of scoped) {
      const verdict = verdicts[project.path] ?? "unknown";
      counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
    }
    return VERDICT_ORDER.filter((verdict) => counts.has(verdict)).map(
      (verdict) => [verdict, counts.get(verdict) ?? 0] as const,
    );
  }, [scoped, verdicts]);

  // `/` reaches the filter from anywhere on the screen, the way a list-shaped
  // tool is expected to behave. Typing into a field keeps its own slash.
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  // Summed over the projects that are in the index right now, not over every
  // footprint ever measured: the cache outlives the workspace it was read for,
  // so folders the user dropped would keep counting toward the total.
  const totals = useMemo(
    () =>
      index.projects.reduce(
        (sum, project) => {
          const footprint = footprints[project.path];
          if (!footprint) return sum;
          return {
            totalBytes: sum.totalBytes + footprint.totalBytes,
            reclaimableBytes: sum.reclaimableBytes + footprint.reclaimableBytes,
          };
        },
        { totalBytes: 0, reclaimableBytes: 0 },
      ),
    [index.projects, footprints],
  );

  const countByRoot = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of index.projects) counts.set(project.root, (counts.get(project.root) ?? 0) + 1);
    return counts;
  }, [index.projects]);

  const grouped = useMemo(() => {
    const groups = new Map<Verdict, WorkspaceProject[]>();
    for (const project of visible) {
      const verdict = verdicts[project.path] ?? "unknown";
      groups.set(verdict, [...(groups.get(verdict) ?? []), project]);
    }
    for (const projects of groups.values()) {
      projects.sort(
        (left, right) =>
          (footprints[right.path]?.reclaimableBytes ?? 0) - (footprints[left.path]?.reclaimableBytes ?? 0),
      );
    }
    return VERDICT_ORDER.filter((verdict) => groups.has(verdict)).map(
      (verdict) => [verdict, groups.get(verdict) ?? []] as const,
    );
  }, [visible, verdicts, footprints]);

  // Counted over the whole index, never over what is on screen: a filter is not
  // a reason to stop reporting work that exists nowhere else.
  const atRisk = index.projects.filter((project) => (verdicts[project.path] ?? "unknown") === "protect").length;
  const filtering = normalizedQuery.length > 0 || activeRoot !== null || activeVerdict !== null;
  const singleRoot = chosenRoots.length === 1;

  return (
    <div className="flex min-h-0 w-full flex-1 gap-5 overflow-hidden">
      {/* The folders are the workspace, so they get a column of their own: this
          is where they are chosen, dropped, and used to narrow the list. */}
      <aside className="flex w-44 shrink-0 flex-col overflow-y-auto pr-1 sm:w-52" aria-label="Workspace filters">
        <p className="shrink-0 px-1 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
          Folders
        </p>

        {/* The list takes the height it needs and no more, so a workspace with
            one folder does not leave a column of empty space above the button. */}
        <div className="shrink-0">
          {/* With a single folder there is nothing to switch between: the folder
              is the workspace, so "All projects" would name the same set twice. */}
          {!singleRoot && (
            <RootItem
              active={activeRoot === null}
              label="All projects"
              count={index.projects.length}
              onSelect={() => setActiveRoot(null)}
              onRemove={onRemoveAllRoots}
              removeLabel={`Remove all ${chosenRoots.length} workspace folders and start over`}
            />
          )}
          {chosenRoots.map((root) => (
            <RootItem
              key={root}
              active={singleRoot || activeRoot === root}
              label={rootName(root)}
              title={root}
              count={countByRoot.get(root) ?? 0}
              indexed={index.roots.includes(root)}
              onSelect={() => setActiveRoot(singleRoot ? null : root)}
              onRemove={() => {
                if (activeRoot === root) setActiveRoot(null);
                onRemoveRoot(root);
              }}
            />
          ))}
        </div>

        <div className="shrink-0 pt-2">
          <ProLockButton
            label="Add another folder"
            reason="Scanning several folders at once is part of Pro"
            locked={!proEnabled && chosenRoots.length > 0}
            onClick={onAddRoot}
            containerClassName="w-full"
            className="w-full rounded-xl px-3 py-2 text-xs font-medium"
            /* The sidebar scrolls, and a scrolling box clips both axes — a
               tooltip wider than the column would be cut off at its edge. So it
               takes the column's width and wraps instead of overflowing it. */
            tooltipClassName="inset-x-0 items-start whitespace-normal text-left leading-snug"
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              Add folder
            </span>
          </ProLockButton>
          {index.rootsOverLimit.length > 0 && (
            <p className="mt-2 rounded-lg border border-pro-200/30 bg-pro-surface px-2.5 py-1.5 text-[10px] leading-4 text-pro-100">
              This plan covers {index.rootLimit === 1 ? "one folder" : `${index.rootLimit} folders`} at a time.
            </p>
          )}
        </div>

        {/* The list is already grouped by verdict; this narrows it to one, so
            "what is at risk" and "what is safe" can be read on their own. */}
        {verdictCounts.length > 1 && (
          <>
            <p className="shrink-0 px-1 pt-5 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
              Verdict
            </p>
            <div className="shrink-0">
              <VerdictFilter
                active={activeVerdict === null}
                label="Every verdict"
                count={scoped.length}
                onSelect={() => setActiveVerdict(null)}
              />
              {verdictCounts.map(([verdict, count]) => (
                <VerdictFilter
                  key={verdict}
                  active={activeVerdict === verdict}
                  label={VERDICT_PRESENTATION[verdict].label}
                  title={VERDICT_PRESENTATION[verdict].summary}
                  dotClassName={VERDICT_PRESENTATION[verdict].dotClassName}
                  count={count}
                  onSelect={() => setActiveVerdict(activeVerdict === verdict ? null : verdict)}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex-1" aria-hidden="true" />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* `pr-1.5` matches the scrollbar gutter the list below reserves, so the
            search field and the cards end on the same edge. */}
        <header className="shrink-0 border-b border-forest-800 pr-1.5 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
              <h1 id="workspace-title" className="text-2xl font-semibold tracking-[-0.045em] text-mist-100">
                {index.projects.length} {index.projects.length === 1 ? "project" : "projects"}
              </h1>
              <Portrait value={formatBytes(totals.totalBytes)} label="on disk" />
              {totals.reclaimableBytes > 0 ? (
                <Portrait value={formatBytes(totals.reclaimableBytes)} label="reclaimable" accent />
              ) : (
                <span className="flex items-baseline text-sm font-semibold text-sage-300">
                  Nothing to reclaim
                </span>
              )}
              {measuring && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-mist-500">
                  <RefreshCw size={11} className="animate-spin" /> measuring
                </span>
              )}
            </div>

            {/* Sage, not coral: pressing this destroys nothing, it opens the
                list where deletion is chosen. The target count is what should
                pull the user through, not an alarm colour on a link. */}
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
              {atRisk === 1 ? "1 project holds work" : `${atRisk} projects hold work`} that exists only on this disk.
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

            {/* The palette's only advertisement. A shortcut nobody is told
                about is a shortcut nobody uses, and this is the screen where
                someone is already looking at the projects it acts on. */}
            <button
              type="button"
              onClick={openPalette}
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

        {/* The only scroller on the screen: the header holds still while the
            list moves under it, and each verdict keeps its title in view. The
            gutter is reserved whether or not the list overflows, so the cards
            keep their width instead of widening when a filter empties the list. */}
        <div className="min-h-0 flex-1">
          <div className="h-full overflow-y-auto pb-6 [scrollbar-gutter:stable]">
            {grouped.map(([verdict, projects]) => (
              <VerdictGroup
                key={verdict}
                verdict={verdict}
                projects={projects}
                footprints={footprints}
                showRoot={index.roots.length > 1 && activeRoot === null}
              />
            ))}
            {visible.length === 0 && (
              <div className="py-16 text-center">
                <FolderOpen size={28} className="mx-auto text-mist-500" strokeWidth={1.5} aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-mist-300">
                  {filtering ? "Nothing matches this filter." : "No projects in this folder."}
                </p>
                <p className="mt-1 text-xs text-mist-500">
                  {index.projects.length} projects were read across{" "}
                  {index.roots.length === 1 ? "one folder" : `${index.roots.length} folders`}.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
          <span className="font-mono text-sage-300">{formatBytes(lifetime.allTimeBytes)}</span> reclaimed
          with Uncached
        </span>
      )}
    </p>
  );
}

function Portrait({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-mono text-lg font-semibold ${accent ? "text-sage-300" : "text-mist-100"}`}>{value}</span>
      <span className="text-[11px] text-mist-500">{label}</span>
    </span>
  );
}

/**
 * Selecting narrows the list; the cross drops the folder from the workspace.
 * Remove is not a delete: it stops the folder being read, nothing on disk moves.
 */
function RootItem({
  active,
  label,
  title,
  count,
  indexed = true,
  onSelect,
  onRemove,
  removeLabel,
}: {
  active: boolean;
  label: string;
  title?: string;
  count: number;
  indexed?: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div
      className={`group/root flex items-center gap-1 rounded-lg pr-1 transition-colors ${active ? "bg-forest-800" : "hover:bg-forest-850"
        }`}
    >
      <button
        type="button"
        onClick={onSelect}
        title={title}
        aria-current={active ? "true" : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors ${active ? "text-mist-100" : "text-mist-500 hover:text-mist-300"
          }`}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 font-mono text-[10px] opacity-70">{indexed ? count : "—"}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${label} from the workspace`}
          className="grid size-5 shrink-0 place-items-center rounded-md text-mist-500 opacity-0 transition-colors group-hover/root:opacity-100 group-focus-within/root:opacity-100 hover:bg-forest-800 hover:text-coral-300"
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function VerdictFilter({
  active,
  label,
  title,
  count,
  dotClassName,
  onSelect,
}: {
  active: boolean;
  label: string;
  title?: string;
  count: number;
  dotClassName?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={title}
      aria-pressed={active}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${active ? "bg-forest-800 text-mist-100" : "text-mist-500 hover:bg-forest-850 hover:text-mist-300"
        }`}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${dotClassName ?? "bg-transparent"}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 font-mono text-[10px] opacity-70">{count}</span>
    </button>
  );
}

function VerdictGroup({
  verdict,
  projects,
  footprints,
  showRoot,
}: {
  verdict: Verdict;
  projects: WorkspaceProject[];
  footprints: Record<string, Footprint>;
  showRoot: boolean;
}) {
  const presentation = VERDICT_PRESENTATION[verdict];
  const reclaimable = projects.reduce(
    (sum, project) => sum + (footprints[project.path]?.reclaimableBytes ?? 0),
    0,
  );

  return (
    <section aria-labelledby={`verdict-${verdict}`} className="pb-5">
      {/* Sticky, because a verdict the user has scrolled into is the one piece
          of context every row below it depends on. */}
      <div className="sticky top-0 z-10 flex items-center gap-x-2.5 bg-forest-950 py-2">
        <span className={`size-1.5 shrink-0 rounded-full ${presentation.dotClassName}`} aria-hidden="true" />
        <h2 id={`verdict-${verdict}`} className="shrink-0 text-xs font-semibold text-mist-100">
          {presentation.label}
        </h2>
        <span className="shrink-0 font-mono text-[10px] text-mist-500">{projects.length}</span>
        <p className="min-w-0 flex-1 truncate text-xs text-mist-500">{presentation.summary}</p>
        {reclaimable > 0 && (
          <span className="shrink-0 font-mono text-[11px] text-mist-500">{formatBytes(reclaimable)} reclaimable</span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-forest-800 bg-forest-900">
        {projects.map((project, position) => (
          <ProjectRow
            key={project.path}
            project={project}
            verdict={verdict}
            footprint={footprints[project.path] ?? null}
            first={position === 0}
            showRoot={showRoot}
          />
        ))}
      </div>
    </section>
  );
}

function ProjectRow({
  project,
  verdict,
  footprint,
  first,
  showRoot,
}: {
  project: WorkspaceProject;
  verdict: Verdict;
  footprint: Footprint | null;
  first: boolean;
  showRoot: boolean;
}) {
  const evidence = projectEvidence(project, verdict, footprint);
  const share = footprint && footprint.totalBytes > 0 ? footprint.reclaimableBytes / footprint.totalBytes : 0;

  return (
    <motion.article
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-forest-850 ${first ? "" : "border-t border-forest-800"
        }`}
    >
      {/* Line one is identity, line two is the finding. Both keep their own row
          of the grid so the size column lines up across every group. */}
      <div className="col-start-1 flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-mist-100">{project.name}</span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">{project.kind}</span>
        {project.git.branch && (
          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-mist-500">
            <GitBranch size={10} aria-hidden="true" />
            {project.git.branch}
          </span>
        )}
        {showRoot && (
          <span className="shrink-0 truncate font-mono text-[10px] text-mist-500">{rootName(project.root)}</span>
        )}
        {project.duplicateOf.length > 0 && (
          <span
            title={project.duplicateOf.join("\n")}
            className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-mist-500"
          >
            <Copy size={9} aria-hidden="true" />
            {project.duplicateOf.length === 1 ? "1 copy" : `${project.duplicateOf.length} copies`}
          </span>
        )}
      </div>

      {/* The sentence is the product: it says what no file manager can. */}
      <p className="col-start-1 row-start-2 truncate text-xs text-mist-500">{evidence}</p>

      {/* Two measurements, one under the other on the row's own two lines: what
          the project weighs, and how much of that weight is regenerable. The bar
          reads as the share only because the number it belongs to sits beside
          it — on its own it looked like a fill gauge. */}
      <div className="col-start-2 row-span-2 row-start-1 flex items-center gap-3">
        {footprint ? (
          <span className="w-48">
            <span className="flex items-baseline justify-end gap-1.5">
              <span className="font-mono text-xs text-mist-100">{formatBytes(footprint.totalBytes)}</span>
              <span className="text-[10px] text-mist-500">on disk</span>
            </span>
            <span className="mt-1.5 flex items-center justify-end gap-2">
              {footprint.reclaimableBytes > 0 ? (
                <>
                  <span className="block h-1 w-10 shrink-0 overflow-hidden rounded-full bg-forest-800" aria-hidden="true">
                    <span className="block h-full rounded-full bg-sage-400" style={{ width: `${share * 100}%` }} />
                  </span>
                  <span className="font-mono text-[11px] text-sage-300">
                    {formatBytes(footprint.reclaimableBytes)}
                  </span>
                  <span className="text-[10px] text-mist-500">reclaimable</span>
                </>
              ) : (
                <span className="text-[11px] font-medium text-sage-300">Nothing to reclaim</span>
              )}
            </span>
          </span>
        ) : (
          <span className="w-48 text-right font-mono text-[10px] text-mist-500/60">measuring...</span>
        )}
      </div>
    </motion.article>
  );
}
