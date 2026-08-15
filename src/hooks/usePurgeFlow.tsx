import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useScanWorkspace } from "./useScanWorkspace";
import { useWorkspaceIndex } from "./useWorkspaceIndex";
import { useWorkspaceWatch } from "./useWorkspaceWatch";
import { RESET, type View as MapViewState } from "../utils/viewport.mjs";
import { useWorkspaceFootprints } from "./useWorkspaceFootprints";
import { useWorkspaceVerdicts } from "./useWorkspaceVerdicts";
import { useWorkspaceAnalysis } from "./useWorkspaceAnalysis";
import type { CleanMode } from "../types/settings";
import type { WorkspaceProject } from "../types/workspace";

const NO_PROJECTS: WorkspaceProject[] = [];

/** Which reading of the scan is on screen: the projects, or the artifacts. */
export type ResultsView = "projects" | "artifacts";

type PurgeFlow = ReturnType<typeof useScanWorkspace> & {
  index: ReturnType<typeof useWorkspaceIndex>;
  footprints: Record<string, import("../types/workspace").Footprint>;
  measuring: boolean;
  /** Re-reads one project, for after something under it was removed. */
  remeasureProject: (path: string) => Promise<void>;
  verdicts: ReturnType<typeof useWorkspaceVerdicts>;
  /**
   * The three deeper readings, taken once per workspace and held here so
   * switching tabs does not pay for them again.
   */
  analysis: ReturnType<typeof useWorkspaceAnalysis>;
  view: ResultsView;
  setView: (view: ResultsView) => void;
  /** The verdict the workspace list is narrowed to, if any. */
  activeVerdict: string | null;
  setActiveVerdict: (verdict: string | null) => void;
  /** The artifact kind the list is narrowed to, if any. */
  activeCategory: string | null;
  setActiveCategory: (category: string | null) => void;
  /** Narrowed to projects that are a second copy of a repository. */
  clonesOnly: boolean;
  setClonesOnly: (only: boolean) => void;
  /** A project the user asked to be shown, until the list has shown it. */
  mapView: MapViewState;
  setMapView: (next: MapViewState | ((current: MapViewState) => MapViewState)) => void;
  focusPath: string | null;
  focusProject: (path: string) => void;
  clearFocus: () => void;
  /** The project whose own page is open, if any. */
  detailPath: string | null;
  openProject: (path: string) => void;
  closeProject: () => void;
};

const PurgeFlowContext = createContext<PurgeFlow | null>(null);

/**
 * One scan, read two ways: the artifacts inside the chosen folders, and the
 * projects that own them. Held above the layout so the shell can read the
 * current step without every screen's props passing through App.
 */
export function PurgeFlowProvider({
  cleanMode,
  savedRoots,
  onRootsChange,
  proEnabled,
  children,
}: {
  cleanMode: CleanMode;
  savedRoots: string[] | null;
  onRootsChange: (roots: string[]) => void;
  proEnabled: boolean;
  children: ReactNode;
}) {
  const index = useWorkspaceIndex();
  const flow = useScanWorkspace(cleanMode, index.scanRoots, onRootsChange, proEnabled);
  const projects = index.index?.projects ?? NO_PROJECTS;
  const { footprints, measuring, remeasure } = useWorkspaceFootprints(projects);
  const verdicts = useWorkspaceVerdicts(projects, footprints);
  const projectPaths = useMemo(() => projects.map((project) => project.path), [projects]);
  const analysis = useWorkspaceAnalysis({
    projectPaths,
    roots: flow.extraRoots,
    // Waits for the weights: these three contend for the same disk as the
    // footprint pass, and those are the numbers the user is watching.
    settled: !measuring && projects.length > 0,
  });
  const [view, setView] = useState<ResultsView>("projects");
  // Held here rather than in the list: Insights sends the user to a filtered
  // workspace, and a sentence that cannot reach its own destination is the
  // decoration this module is supposed to avoid.
  const [activeVerdict, setActiveVerdict] = useState<string | null>(null);
  // Held beside it for the same reason: Insights has sentences about a dominant
  // artifact kind and about clones, and a sentence that cannot reach its own
  // destination is the decoration this module exists to avoid. Both lost their
  // buttons when the map could not filter for them; these are the filters.
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [clonesOnly, setClonesOnly] = useState(false);
  // A request, not a selection. Anywhere in the app can ask for a project to
  // be put in front of the user; only the list knows what is currently hiding
  // it, so the list is what answers and then clears the request.
  const [focusPath, setFocusPath] = useState<string | null>(null);
  // Where the reader is looking on the map. Up here with the other view state,
  // because the drawing unmounts whenever the list is showing and a place you
  // navigated to is not a property of the component that drew it.
  const [mapView, setMapView] = useState<MapViewState>(RESET);
  const [detailPath, setDetailPath] = useState<string | null>(null);

  // Reopening the app lands on the folders the user last chose, already being
  // read. Discovery is milliseconds; the weights fill in behind it as always.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !savedRoots || savedRoots.length === 0) return;
    restored.current = true;
    flow.restoreRoots(savedRoots);
    void index.scanRoots(savedRoots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRoots]);

  // The index is read again when the window comes back, and when the disk says
  // something under the chosen folders changed. There is no refresh control to
  // press: returning to the app is one gesture that means "read it again", and
  // a build finishing while the window is already in front is the other.
  // `refreshIfStale` decides whether either is worth acting on.
  const roots = flow.extraRoots;
  useEffect(() => {
    if (roots.length === 0) return;
    function refresh() {
      if (document.visibilityState === "hidden") return;
      void index.refreshIfStale(roots);
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots]);

  useWorkspaceWatch({
    roots,
    // A scan and a cleanup are the app writing the tree it would re-read.
    busy: flow.scanning || flow.cleaningTargetIds.size > 0,
    // Read, not `refreshIfStale`. Focus is a guess that something might have
    // changed and is rightly gated by a timer; a watcher event is evidence
    // that something did. Gating evidence behind the timer built for guesses
    // meant adding a project and watching nothing happen for five minutes.
    onChanged: () => void index.scanRoots(roots),
  });

  // Changing the folders while results are on screen re-reads both of them. The
  // artifact list authorizes deletion, so it can never outlive the folders it
  // was built from; step 1 is excluded because it has its own scan button.
  const rootsKey = useRef<string | null>(null);
  useEffect(() => {
    const key = roots.join("\n");
    const first = rootsKey.current === null;
    if (rootsKey.current === key) return;
    rootsKey.current = key;
    if (first || roots.length === 0 || flow.step === 1) return;
    // `startScan` re-indexes the projects as well, so this covers both readings.
    void flow.startScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots]);

  // A new scan replaces both readings, so it also puts the projects back in
  // front: the artifact list it would otherwise return to no longer exists.
  useEffect(() => {
    if (flow.step !== 3) {
      setView("projects");
      // The page reads a project out of the index. A scan replaces the index,
      // so a page left open would be describing something that no longer exists.
      setDetailPath(null);
    }
  }, [flow.step]);

  return (
    <PurgeFlowContext.Provider
      value={{
        ...flow,
        index,
        footprints,
        measuring,
        remeasureProject: remeasure,
        verdicts,
        analysis,
        view,
        setView,
        activeVerdict,
        setActiveVerdict,
        activeCategory,
        setActiveCategory,
        clonesOnly,
        setClonesOnly,
        mapView,
        setMapView,
        focusPath,
        focusProject: setFocusPath,
        clearFocus: () => setFocusPath(null),
        detailPath,
        openProject: setDetailPath,
        closeProject: () => setDetailPath(null),
      }}
    >
      {children}
    </PurgeFlowContext.Provider>
  );
}

export function usePurgeFlow(): PurgeFlow {
  const flow = useContext(PurgeFlowContext);
  if (!flow) throw new Error("usePurgeFlow must be used inside PurgeFlowProvider");
  return flow;
}
