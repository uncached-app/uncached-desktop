import { FolderOpen } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ProjectContextMenu, type MenuAnchor } from "./map/ProjectContextMenu";
import { FolderMenu, type FolderAnchor } from "../shared/FolderMenu";
import { useFlash } from "../../hooks/useFlash";
import { ProjectRow } from "./map/ProjectRow";
import { FamilyGroup } from "./map/FamilyGroup";
import { VerdictGroup } from "./map/VerdictGroup";
import { WorkspaceHeader } from "./map/WorkspaceHeader";
import { WorkspaceSidebar } from "./map/WorkspaceSidebar";
import { useFocusedProject } from "./map/useFocusedProject";
import { rootName } from "./map/naming";
import { VERDICT_ORDER, VERDICT_PRESENTATION } from "./verdictPresentation";
import { formatBytes } from "../../utils/format.mjs";
import { workspaceGraph } from "../../utils/graph.mjs";
import { WorkspaceCanvas } from "./map/WorkspaceCanvas";
import { useDrawingAspect } from "./map/useDrawingAspect";
import { useShortcuts } from "../../hooks/useShortcuts";
import type { DuplicatePackage } from "../../types/duplicates";
import type { View as MapViewState } from "../../utils/viewport.mjs";
import type { WorkspaceView } from "../../types/settings";
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
  activeCategory: string | null;
  setActiveCategory: (category: string | null) => void;
  clonesOnly: boolean;
  setClonesOnly: (only: boolean) => void;
  /** A project someone asked to be shown. The list is what makes it visible. */
  focusPath: string | null;
  onFocusHandled: () => void;
  /** Which reading opens, from Settings. */
  view: WorkspaceView;
  /**
   * Where the reader is looking on the map, held above this screen.
   *
   * The drawing unmounts when the list is showing, so a view kept inside it is
   * lost every time somebody looks at the list — and the map is the one thing
   * here you navigate to a place in.
   */
  mapView: [MapViewState, (next: MapViewState | ((current: MapViewState) => MapViewState)) => void];
  /**
   * Whether the filter column is folded away.
   *
   * Kept in settings rather than here: it is a decision made once, and a window
   * that forgets it asks again on every visit.
   */
  onViewChange: (view: WorkspaceView) => void;
  sidebarHidden: boolean;
  onSidebarHiddenChange: (hidden: boolean) => void;
  /** Keys the user bound differently. The defaults live in `actions.ts`. */
  shortcuts: Record<string, string> | undefined;
  /** Reads the chosen folders again, which is a scan and not a filter. */
  onRescan: () => void;
  /** Shared packages, for the map. The list has no place to say this. */
  packages: DuplicatePackage[];
  /** That reading has not finished, so the middle of the map is not final. */
  analysing: boolean;
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
  activeCategory,
  setActiveCategory,
  clonesOnly,
  setClonesOnly,
  focusPath,
  onFocusHandled,
  onOpenProject,
  packages,
  analysing,
  view,
  mapView,
  onViewChange,
  sidebarHidden,
  onSidebarHiddenChange,
  shortcuts,
  onRescan,
}: WorkspaceMapProps) {
  const [activeRoot, setActiveRoot] = useState<string | null>(null);

  /**
   * Every filter off, from wherever it is asked for.
   *
   * Written three times before this: once for the focus handler, once for the
   * empty state's button, once for the header's. Three copies of the same five
   * calls is three places to forget the sixth filter on the day there is one.
   */
  const clearEveryFilter = useCallback(() => {
    onQueryChange("");
    setActiveRoot(null);
    setActiveVerdict(null);
    setActiveCategory(null);
    setClonesOnly(false);
  }, [onQueryChange, setActiveVerdict, setActiveCategory, setClonesOnly]);
  // Verdict first by default, because what a project holds decides whether its
  // size is worth acting on at all. Size is the other reading, and until now it
  // was unreachable: grouping runs before sorting, so the heaviest project on
  // the machine could sit below three groups of smaller ones.
  const [order, setOrder] = useState<"verdict" | "size" | "folder">("verdict");
  // Which reading opens is a preference, kept in Settings — the header used to
  // ask it on every visit and forget the answer on every close. Pro decides
  // whether the map exists at all, so a preference set before a licence lapsed
  // reads as the list rather than as an empty screen.
  const onMap = view === "map" && proEnabled;
  const { ref: drawing, aspect, height: drawingHeight } = useDrawingAspect();

  // The verbs that only mean something on this screen. These were two `keydown`
  // handlers written beside what they operate, with the sidebar's `⌘B` closing
  // over a stale `sidebarHidden` because the effect took no dependencies — a
  // toggle that worked once and then flipped between the same two states.
  useShortcuts(
    {
      focusFilter: () => searchRef.current?.focus(),
      toggleSidebar: () => onSidebarHiddenChange(!sidebarHidden),
      toggleMap: () => proEnabled && onViewChange(view === "map" ? "list" : "map"),
      rescan: onRescan,
      quickClean: onReclaim,
    },
    shortcuts,
  );
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  // A folder was the one thing on this screen you could look at and not act on:
  // named in the map, named above a group in the list, and openable from
  // neither. The verbs are a project's minus the ones a directory cannot mean.
  const [folderMenu, setFolderMenu] = useState<FolderAnchor | null>(null);
  const [flash, report] = useFlash();

  // A right-click anywhere on a row, rather than a hidden button that has to be
  // found: the verbs already exist and the project page is one click away, so
  // the only thing missing was the gesture every list-shaped tool has.
  function openMenu(project: WorkspaceProject, event: React.MouseEvent) {
    event.preventDefault();
    setMenu({ project, x: event.clientX, y: event.clientY });
  }

  // One folder, or none. Selecting one in the sidebar is what makes the answer
  // unambiguous; with several chosen and none selected, an icon offering to
  // open "the" folder would be picking for the reader.
  const headerFolder = activeRoot ?? (chosenRoots.length === 1 ? chosenRoots[0] : null);

  function openFolderMenu(path: string, name: string, event: React.MouseEvent) {
    event.preventDefault();
    setFolderMenu({ path, name, x: event.clientX, y: event.clientY });
  }

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

  // Every filter narrows the same set, so they compose rather than replace one
  // another: "clones holding a Cargo target" is a question, and answering it
  // with only the last filter clicked would be a list that does not match what
  // the sidebar says is on.
  const narrow = useCallback(
    (projects: WorkspaceProject[], except: "verdict" | "category" | "clones" | null) => {
      let narrowed = projects;
      if (activeVerdict && except !== "verdict") {
        narrowed = narrowed.filter(
          (project) => (verdicts[project.path] ?? "unknown") === activeVerdict,
        );
      }
      if (activeCategory && except !== "category") {
        narrowed = narrowed.filter((project) =>
          (footprints[project.path]?.byCategory ?? []).some((entry) => entry.category === activeCategory),
        );
      }
      if (clonesOnly && except !== "clones") {
        narrowed = narrowed.filter((project) => project.duplicateOf.length > 0);
      }
      return narrowed;
    },
    [activeVerdict, verdicts, activeCategory, footprints, clonesOnly],
  );

  const visible = useMemo(() => narrow(scoped, null), [narrow, scoped]);

  /**
   * What each filter would leave, counted against every filter but its own.
   *
   * Counted against the root and the text alone, the sidebar went on offering
   * rows that led nowhere: narrow to `Protect` and "Copies of a repo" still
   * read two, and clicking it produced an empty list — a control whose own
   * number said it would do something.
   *
   * A dimension is excluded from its own count so that choosing within it does
   * not renumber the options under the cursor. Choosing in another dimension
   * does, which is the whole point.
   */
  const forVerdict = useMemo(() => narrow(scoped, "verdict"), [narrow, scoped]);
  const forCategory = useMemo(() => narrow(scoped, "category"), [narrow, scoped]);
  const forClones = useMemo(() => narrow(scoped, "clones"), [narrow, scoped]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of forCategory) {
      for (const entry of footprints[project.path]?.byCategory ?? []) {
        counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    );
  }, [forCategory, footprints]);

  const cloneCount = useMemo(
    () => forClones.filter((project) => project.duplicateOf.length > 0).length,
    [forClones],
  );

  const verdictCounts = useMemo(() => {
    const counts = new Map<Verdict, number>();
    for (const project of forVerdict) {
      const verdict = verdicts[project.path] ?? "unknown";
      counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
    }
    return VERDICT_ORDER.filter((verdict) => counts.has(verdict)).map(
      (verdict) => [verdict, counts.get(verdict) ?? 0] as const,
    );
  }, [forVerdict, verdicts]);


  useFocusedProject({
    focusPath,
    listRef,
    visibleCount: visible.length,
    onClearFilters: clearEveryFilter,
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

  // Sorted by what is on disk rather than by what is reclaimable: the question
  // this order answers is "what is taking up my space", and a 60 GB project with
  // nothing to reclaim is still the answer to it. Reclaimable already leads
  // inside every verdict group, which is the other question.
  const ranked = useMemo(
    () =>
      [...visible].sort(
        (left, right) =>
          (footprints[right.path]?.totalBytes ?? 0) - (footprints[left.path]?.totalBytes ?? 0),
      ),
    [visible, footprints],
  );

  // Families are read from the whole index, then narrowed to what is on
  // screen: a filter that hides two of four members leaves a pair, not a group
  // of four with two of them missing.
  const families = useMemo(() => {
    const shown = new Set(visible.map((project) => project.path));
    return (index.families ?? [])
      .map((family) => ({ ...family, members: family.members.filter((member) => shown.has(member)) }))
      .filter((family) => family.members.length > 1);
  }, [index.families, visible]);

  // The reading the list did not have: what shares a directory. Members keep
  // the heaviest-first order every other group uses, and everything standing
  // alone falls into one block at the end.
  const byFamily = useMemo(() => {
    const heaviest = (left: WorkspaceProject, right: WorkspaceProject) =>
      (footprints[right.path]?.reclaimableBytes ?? 0) - (footprints[left.path]?.reclaimableBytes ?? 0);
    const shown = new Map(visible.map((project) => [project.path, project]));

    const groups = families
      .map((family) => ({
        id: family.path,
        name: family.name,
        detail: family.declaredBy ? `${family.declaredBy} workspace` : "One folder, several projects",
        declared: Boolean(family.declaredBy),
        projects: family.members
          .map((member) => shown.get(member))
          .filter((project): project is WorkspaceProject => Boolean(project))
          .sort(heaviest),
      }))
      .filter((group) => group.projects.length > 1)
      .sort((left, right) => right.projects.length - left.projects.length || left.name.localeCompare(right.name));

    const grouped = new Set(groups.flatMap((group) => group.projects.map((project) => project.path)));
    const alone = visible.filter((project) => !grouped.has(project.path)).sort(heaviest);

    return alone.length > 0
      ? [...groups, { id: "alone", name: "On their own", detail: "In no directory with another project", declared: false, projects: alone }]
      : groups;
  }, [families, visible, footprints]);

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
  // Built here rather than inside the canvas, because whether it can be drawn
  // at all is what decides which view renders — and the answer to "no" is the
  // list, not an empty frame where a picture would have been.
  const graph = useMemo(
    () =>
      onMap
        ? workspaceGraph({ projects: visible, footprints, verdicts, packages, families, aspect })
        : null,
    [onMap, visible, footprints, verdicts, packages, families, aspect],
  );
  // There is no size the map refuses now that it can be navigated: it packs
  // outward at a constant node size and the view is what moves. Only an empty
  // set has nothing to draw.
  const drawable = graph !== null && visible.length > 0;

  /**
   * Every filter that is on, as a label and the way to lift it.
   *
   * Built here because this is where they all live — the folder and the text
   * belong to this component, the other three are lifted through it — and the
   * header only has to draw what it is handed.
   */
  const active = useMemo(() => {
    const chips: Array<{ id: string; label: string; onClear: () => void }> = [];
    if (activeRoot) {
      chips.push({ id: "root", label: rootName(activeRoot), onClear: () => setActiveRoot(null) });
    }
    if (normalizedQuery) {
      chips.push({ id: "query", label: `"${query.trim()}"`, onClear: () => onQueryChange("") });
    }
    if (activeVerdict) {
      chips.push({
        id: "verdict",
        label: VERDICT_PRESENTATION[activeVerdict].label,
        onClear: () => setActiveVerdict(null),
      });
    }
    if (activeCategory) {
      chips.push({ id: "category", label: activeCategory, onClear: () => setActiveCategory(null) });
    }
    if (clonesOnly) {
      chips.push({ id: "clones", label: "Copies of a repo", onClear: () => setClonesOnly(false) });
    }
    return chips;
  }, [
    activeRoot,
    normalizedQuery,
    query,
    onQueryChange,
    activeVerdict,
    setActiveVerdict,
    activeCategory,
    setActiveCategory,
    clonesOnly,
    setClonesOnly,
  ]);

  const filtering =
    normalizedQuery.length > 0 ||
    activeRoot !== null ||
    activeVerdict !== null ||
    activeCategory !== null ||
    clonesOnly;

  return (
    <div className="flex min-h-0 w-full flex-1 gap-5 overflow-hidden">
      <div
        className={`shrink-0 transition-all duration-200 ease-in-out overflow-hidden ${
          sidebarHidden ? "w-0 -mr-5 opacity-0 pointer-events-none" : "w-52 sm:w-60 opacity-100"
        }`}
      >
        <WorkspaceSidebar
          index={index}
          chosenRoots={chosenRoots}
          countByRoot={countByRoot}
          activeRoot={activeRoot}
          onActiveRoot={setActiveRoot}
          verdictCounts={verdictCounts}
          verdictTotal={forVerdict.length}
          categoryTotal={forCategory.length}
          activeVerdict={activeVerdict}
          onActiveVerdict={setActiveVerdict}
          categoryCounts={categoryCounts}
          activeCategory={activeCategory}
          onActiveCategory={setActiveCategory}
          cloneCount={cloneCount}
          clonesOnly={clonesOnly}
          onClonesOnly={setClonesOnly}
          proEnabled={proEnabled}
          onAddRoot={onAddRoot}
          onRemoveRoot={onRemoveRoot}
          onRemoveAllRoots={onRemoveAllRoots}
          onFolderMenu={openFolderMenu}
        />
      </div>

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
          folder={headerFolder}
          onFolderResult={report}
          onRescan={onRescan}
          order={order}
          onOrderChange={setOrder}
          hasFamilies={families.length > 0}
          view={onMap ? "map" : "list"}
          onViewChange={onViewChange}
          canMap={proEnabled}
          active={active}
          onClearAll={clearEveryFilter}
          sidebarCollapsed={sidebarHidden}
          onToggleSidebar={() => onSidebarHiddenChange(!sidebarHidden)}
        />

        {/* The map reads the same narrowed set as the list. A filter is a
            question about the workspace, and switching view is not answering a
            different one. */}
        {drawable && graph && (
          <div ref={drawing} className="min-h-0 flex-1 overflow-hidden pt-3.5 pr-2 pb-2">
            <WorkspaceCanvas
              graph={graph}
              projects={visible}
              footprints={footprints}
              verdicts={verdicts}
              analysing={analysing}
              measuring={measuring}
              viewportHeight={drawingHeight}
              viewState={mapView}
              onOpenProject={onOpenProject}
              onContextMenu={openMenu}
              onFolderMenu={(label, event) => openFolderMenu(label.path, label.text, event)}
              focusPath={focusPath}
            />
          </div>
        )}

        {/* The only scroller on the screen: the header holds still while the
            list moves under it, and each verdict keeps its title in view. The
            gutter is reserved whether or not the list overflows, so the cards
            keep their width instead of widening when a filter empties the list. */}
        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden pt-3.5 ${drawable ? "hidden" : ""}`}>
          {/* The map was asked for and there is nothing in it. Saying so beside
              the list that replaced it is the difference between a view that
              fell back and a setting that appears not to have been saved. */}
          {onMap && !drawable && (
            <p className="mb-3 shrink-0 rounded-xl border border-forest-800 bg-forest-900 px-3.5 py-2.5 text-xs leading-5 text-mist-500">
              Nothing matches the filters, so there is no picture to draw.
            </p>
          )}
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2 pb-6 scrollbar-gutter-stable">
            {order === "folder" &&
              byFamily.map((group) => (
                <FamilyGroup
                  key={group.id}
                  id={group.id}
                  name={group.name}
                  detail={group.detail}
                  declared={group.declared}
                  projects={group.projects}
                  verdicts={verdicts}
                  footprints={footprints}
                  showRoot={index.roots.length > 1 && activeRoot === null}
                  focusPath={focusPath}
                  onOpenProject={onOpenProject}
                  onContextMenu={openMenu}
                  onFolderMenu={
                    group.id === "alone"
                      ? undefined
                      : (event) => openFolderMenu(group.id, group.name, event)
                  }
                />
              ))}

            {order === "size" && visible.length > 0 && (
              <section aria-label="Projects ranked by size" className="pb-5">
                <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-x-2.5 rounded-t-none rounded-b-xl bg-forest-950/90 px-2.5 py-2 backdrop-blur-md">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full bg-sage-400" aria-hidden="true" />
                    <h2 className="shrink-0 text-xs font-semibold text-mist-100">
                      Ranked by Disk Size
                    </h2>
                    <span className="shrink-0 rounded-md bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] font-medium text-mist-300">
                      {ranked.length}
                    </span>
                    <span className="hidden sm:inline-block truncate text-xs text-mist-500">· Heaviest projects first</span>
                  </div>

                  {totals.reclaimableBytes > 0 && (
                    <span className="shrink-0 rounded-md bg-forest-900 border border-forest-800 px-2 py-0.5 font-mono text-[11px] font-medium text-sage-300">
                      {formatBytes(totals.reclaimableBytes)} reclaimable
                    </span>
                  )}
                </div>

                <div className="overflow-hidden rounded-2xl border border-forest-800 bg-forest-900 shadow-xs">
                  {ranked.map((project, position) => (
                    <ProjectRow
                      key={project.path}
                      project={project}
                      verdict={verdicts[project.path] ?? "unknown"}
                      footprint={footprints[project.path] ?? null}
                      first={position === 0}
                      showRoot={index.roots.length > 1 && activeRoot === null}
                      // Nothing else says it here: there is no group heading above
                      // a flat list, and a heavy project is exactly the one whose
                      // verdict has to be read before acting on the number.
                      showVerdict
                      focused={project.path === focusPath}
                      onOpen={onOpenProject}
                      onContextMenu={(event) => openMenu(project, event)}
                    />
                  ))}
                </div>
              </section>
            )}

            {order === "verdict" &&
              grouped.map(([verdict, projects]) => (
                <VerdictGroup
                  key={verdict}
                  verdict={verdict}
                  projects={projects}
                  footprints={footprints}
                  showRoot={index.roots.length > 1 && activeRoot === null}
                  focusPath={focusPath}
                  onOpenProject={onOpenProject}
                  onContextMenu={openMenu}
                />
              ))}

            {visible.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="grid size-12 place-items-center rounded-2xl border border-forest-800 bg-forest-900 text-mist-500">
                  <FolderOpen size={24} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <p className="mt-4 text-sm font-semibold text-mist-100">
                  {filtering ? "No projects match this filter" : "No projects in this folder"}
                </p>
                <p className="mt-1 text-xs text-mist-500 max-w-sm leading-relaxed">
                  {index.projects.length} projects were indexed across{" "}
                  {index.roots.length === 1 ? "1 folder" : `${index.roots.length} folders`}.
                </p>
                {filtering && (
                  <button
                    type="button"
                    onClick={clearEveryFilter}
                    className="mt-4 rounded-xl border border-forest-800 bg-forest-900 px-3.5 py-2 text-xs font-medium text-sage-300 transition-all hover:bg-forest-850 hover:border-sage-400/60"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {menu && (
        <ProjectContextMenu
          anchor={menu}
          onOpenProject={onOpenProject}
          onResult={report}
          onClose={() => setMenu(null)}
        />
      )}

      {folderMenu && (
        <FolderMenu anchor={folderMenu} onResult={report} onClose={() => setFolderMenu(null)} />
      )}

      {/* The verbs mostly leave the app, so the only sign one happened is here.
          Anchored to the window rather than to the row, which has scrolled by
          the time anything reports back. */}
      {flash && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-sage-400/40 bg-forest-900 px-3.5 py-2 text-xs font-medium text-sage-300 shadow-2xl"
        >
          {flash}
        </div>
      )}
    </div>
  );
}
