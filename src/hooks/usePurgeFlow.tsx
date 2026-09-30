import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useScanWorkspace } from "./useScanWorkspace";
import { useWorkspaceIndex } from "./useWorkspaceIndex";
import { useWorkspaceWatch } from "./useWorkspaceWatch";
import { isInside } from "../utils/paths.mjs";
import { useRunningProjects } from "./useRunningProjects";
import { useWorkspaceFootprints } from "./useWorkspaceFootprints";
import { useWorkspaceVerdicts } from "./useWorkspaceVerdicts";
import { useWorkspaceAnalysis } from "./useWorkspaceAnalysis";
import { useUnusedDependencies } from "./useUnusedDependencies";
import type { CleanMode } from "../types/settings";
import type { WorkspaceProject } from "../types/workspace";

const NO_PROJECTS: WorkspaceProject[] = [];

/** Which reading of the scan is on screen: the projects, or the artifacts. */
export type ResultsView = "projects" | "artifacts";

type PurgeFlow = ReturnType<typeof useScanWorkspace> & {
  index: ReturnType<typeof useWorkspaceIndex>;
  footprints: Record<string, import("../types/workspace").Footprint>;
  measuring: boolean;
  /** Projects with a process working inside them, by path. */
  running: ReturnType<typeof useRunningProjects>;
  /** Re-reads one project, for after something under it was removed. */
  remeasureProject: (path: string) => Promise<void>;
  verdicts: ReturnType<typeof useWorkspaceVerdicts>;
  /**
   * The three deeper readings, taken once per workspace and held here so
   * switching tabs does not pay for them again.
   */
  analysis: ReturnType<typeof useWorkspaceAnalysis>;
  /** Held here so leaving the module does not throw the answer away. */
  dependencies: ReturnType<typeof useUnusedDependencies>;
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
  /** Narrowed to the projects keeping their own copy of one package. */
  activePackage: import("../types/duplicates").PackageFilter | null;
  setActivePackage: (filter: import("../types/duplicates").PackageFilter | null) => void;
  /** A project the user asked to be shown, until the list has shown it. */
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
  // Taken before anything is weighed: a project being written to is one the
  // measurement pass skips and the list reports instead.
  const running = useRunningProjects(projects);
  const { footprints, measuring, remeasure } = useWorkspaceFootprints(
    projects,
    running.running,
    running.checked,
  );
  const verdicts = useWorkspaceVerdicts(projects, footprints);
  const projectPaths = useMemo(() => projects.map((project) => project.path), [projects]);
  const analysis = useWorkspaceAnalysis({
    projectPaths,
    roots: flow.extraRoots,
    // Waits for the weights: these three contend for the same disk as the
    // footprint pass, and those are the numbers the user is watching.
    settled: !measuring && projects.length > 0,
  });
  const dependencies = useUnusedDependencies(projectPaths);
  // Artifacts that belong to a project something is working inside.
  //
  // The catalogued caches carry their own `blockedBy` — the backend names the
  // tool that owns each one. Nothing said the same about the artifacts of a
  // running project: the workspace screen knew, because it asks separately, and
  // Reclaim did not, so the same project read as busy on one screen and
  // reclaimable on the other. Filled in here rather than on either screen, so
  // the artifact list, the totals, the selection and the project page all agree
  // without each deriving it.
  const held = running.running;
  const targets = useMemo(() => {
    const projects = Object.values(held);
    if (projects.length === 0) return flow.targets;
    return flow.targets.map((target) => {
      if (target.blockedBy) return target;
      const owner = projects.find((project) => isInside(target.path, project.path));
      return owner ? { ...target, blockedBy: owner.command } : target;
    });
  }, [flow.targets, held]);

  const [view, setView] = useState<ResultsView>("projects");
  // Opening Reclaim *is* the request for artifacts.
  //
  // The walk used to run on the way into the workspace, so everybody paid for
  // it — including the people who came to look at their projects — and the pass
  // over the home caches ran inside it, on a machine nobody had chosen. Now the
  // reading that needs it asks for it, once per set of folders, and step 2 says
  // so while it happens.
  const changeView = useCallback(
    (next: ResultsView) => {
      setView(next);
      if (next !== "artifacts") return;
      if (flow.extraRoots.length === 0 || flow.scanning || flow.scanTaken) return;
      void flow.startScan();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flow.extraRoots, flow.scanning, flow.scanTaken],
  );
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
  const [activePackage, setActivePackage] = useState<
    import("../types/duplicates").PackageFilter | null
  >(null);
  // A request, not a selection. Anywhere in the app can ask for a project to
  // be put in front of the user; only the list knows what is currently hiding
  // it, so the list is what answers and then clears the request.
  const [focusPath, setFocusPath] = useState<string | null>(null);
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

  // Changing the folders re-reads them. The artifact list authorizes deletion,
  // so it can never outlive the folders it was built from.
  const rootsKey = useRef<string | null>(null);
  useEffect(() => {
    const key = roots.join("\n");
    const first = rootsKey.current === null;
    if (rootsKey.current === key) return;
    rootsKey.current = key;
    if (roots.length === 0) return;
    // Adding a folder used to set it and ask for nothing, so Maintenance —
    // which needs the index and never runs a scan — sat on "Reading your
    // folders" waiting for a read nobody started.
    if (first || view !== "artifacts") {
      void index.scanRoots(roots);
      return;
    }
    // Only the reading that has an artifact list pays to rebuild it. That list
    // authorizes deletion, so it can never outlive the folders it was built
    // from; `startScan` re-indexes the projects as well, covering both.
    void flow.startScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots]);

  // A scan replaces the index, so a project page left open would be describing
  // something that no longer exists.
  //
  // The reading is deliberately *not* reset with it. It used to be — a scan put
  // the projects back in front — which was right while Reclaim was somewhere
  // you passed through rather than somewhere you chose. Now that the bar goes
  // straight to it, scanning from Reclaim is exactly how somebody there asks
  // for fresh artifacts, and answering by moving them to the projects takes
  // away the thing they pressed for. Every step renders on its own regardless
  // of the reading, so nothing depends on this being forced.
  useEffect(() => {
    if (flow.step !== 3) setDetailPath(null);
  }, [flow.step]);

  return (
    <PurgeFlowContext.Provider
      value={{
        ...flow,
        // After the spread: the enriched list is the one every screen reads.
        targets,
        index,
        footprints,
        measuring,
        running,
        remeasureProject: remeasure,
        verdicts,
        analysis,
        dependencies,
        view,
        setView: changeView,
        activeVerdict,
        setActiveVerdict,
        activeCategory,
        setActiveCategory,
        clonesOnly,
        setClonesOnly,
        activePackage,
        setActivePackage,
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
