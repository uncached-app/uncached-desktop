import { FolderOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { VerdictGroup } from "./map/VerdictGroup";
import { WorkspaceHeader } from "./map/WorkspaceHeader";
import { WorkspaceSidebar } from "./map/WorkspaceSidebar";
import { useFocusedProject } from "./map/useFocusedProject";
import { VERDICT_ORDER } from "./verdictPresentation";
import { useOpenCommandPalette } from "../../hooks/useCommandPalette";
import type { CleanupTotals, WorkspaceChange } from "../../hooks/useWorkspaceHistory";
import type { Footprint, Verdict, WorkspaceIndex, WorkspaceProject } from "../../types/workspace";

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
  /** A project someone asked to be shown. The list is what makes it visible. */
  focusPath: string | null;
  onFocusHandled: () => void;
  /** A row is the way into a project's own page. */
  onOpenProject: (path: string) => void;
};

/**
 * The workspace, read as projects rather than as artifacts.
 *
 * This file is the arrangement and the narrowing: which projects are in scope,
 * how they group, and what the three filters — folder, text, verdict — leave on
 * screen. Everything that draws is in `map/`.
 */
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
  focusPath,
  onFocusHandled,
  onOpenProject,
}: WorkspaceMapProps) {
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const openPalette = useOpenCommandPalette();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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
    () =>
      activeVerdict
        ? scoped.filter((project) => (verdicts[project.path] ?? "unknown") === activeVerdict)
        : scoped,
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
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))
        return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useFocusedProject({
    focusPath,
    listRef,
    visibleCount: visible.length,
    onClearFilters: () => {
      onQueryChange("");
      setActiveRoot(null);
      setActiveVerdict(null);
    },
    onHandled: onFocusHandled,
  });

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
  const atRisk = index.projects.filter(
    (project) => (verdicts[project.path] ?? "unknown") === "protect",
  ).length;
  const filtering = normalizedQuery.length > 0 || activeRoot !== null || activeVerdict !== null;

  return (
    <div className="flex min-h-0 w-full flex-1 gap-5 overflow-hidden">
      <WorkspaceSidebar
        index={index}
        chosenRoots={chosenRoots}
        countByRoot={countByRoot}
        activeRoot={activeRoot}
        onActiveRoot={setActiveRoot}
        verdictCounts={verdictCounts}
        scopedCount={scoped.length}
        activeVerdict={activeVerdict}
        onActiveVerdict={setActiveVerdict}
        proEnabled={proEnabled}
        onAddRoot={onAddRoot}
        onRemoveRoot={onRemoveRoot}
        onRemoveAllRoots={onRemoveAllRoots}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <WorkspaceHeader
          projectCount={index.projects.length}
          totalBytes={totals.totalBytes}
          reclaimableBytes={totals.reclaimableBytes}
          measuring={measuring}
          atRisk={atRisk}
          targetCount={targetCount}
          onReclaim={onReclaim}
          change={change}
          reclaimed={reclaimed}
          query={query}
          onQueryChange={onQueryChange}
          searchRef={searchRef}
          onOpenPalette={() => openPalette()}
        />

        {/* The only scroller on the screen: the header holds still while the
            list moves under it, and each verdict keeps its title in view. The
            gutter is reserved whether or not the list overflows, so the cards
            keep their width instead of widening when a filter empties the list. */}
        <div className="min-h-0 flex-1">
          <div ref={listRef} className="h-full overflow-y-auto pb-6 [scrollbar-gutter:stable]">
            {grouped.map(([verdict, projects]) => (
              <VerdictGroup
                key={verdict}
                verdict={verdict}
                projects={projects}
                footprints={footprints}
                showRoot={index.roots.length > 1 && activeRoot === null}
                focusPath={focusPath}
                onOpenProject={onOpenProject}
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
