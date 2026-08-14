import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useScanWorkspace } from "./useScanWorkspace";
import { useWorkspaceIndex } from "./useWorkspaceIndex";
import { useWorkspaceFootprints } from "./useWorkspaceFootprints";
import { useWorkspaceVerdicts } from "./useWorkspaceVerdicts";
import type { CleanMode } from "../types/settings";
import type { WorkspaceProject } from "../types/workspace";

const NO_PROJECTS: WorkspaceProject[] = [];

/** Which reading of the scan is on screen: the projects, or the artifacts. */
export type ResultsView = "projects" | "artifacts";

type PurgeFlow = ReturnType<typeof useScanWorkspace> & {
  index: ReturnType<typeof useWorkspaceIndex>;
  footprints: Record<string, import("../types/workspace").Footprint>;
  measuring: boolean;
  verdicts: ReturnType<typeof useWorkspaceVerdicts>;
  view: ResultsView;
  setView: (view: ResultsView) => void;
  /** The verdict the workspace list is narrowed to, if any. */
  activeVerdict: string | null;
  setActiveVerdict: (verdict: string | null) => void;
  /** A project the user asked to be shown, until the list has shown it. */
  focusPath: string | null;
  focusProject: (path: string) => void;
  clearFocus: () => void;
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
  const { footprints, measuring } = useWorkspaceFootprints(projects);
  const verdicts = useWorkspaceVerdicts(projects, footprints);
  const [view, setView] = useState<ResultsView>("projects");
  // Held here rather than in the list: Insights sends the user to a filtered
  // workspace, and a sentence that cannot reach its own destination is the
  // decoration this module is supposed to avoid.
  const [activeVerdict, setActiveVerdict] = useState<string | null>(null);
  // A request, not a selection. Anywhere in the app can ask for a project to
  // be put in front of the user; only the list knows what is currently hiding
  // it, so the list is what answers and then clears the request.
  const [focusPath, setFocusPath] = useState<string | null>(null);

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

  // The index is read again when the window comes back, and only then: there is
  // no refresh control to press, so returning to the app is the gesture that
  // means "read it again". `refreshIfStale` decides whether that is worth doing.
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
    if (flow.step !== 3) setView("projects");
  }, [flow.step]);

  return (
    <PurgeFlowContext.Provider
      value={{
        ...flow,
        index,
        footprints,
        measuring,
        verdicts,
        view,
        setView,
        activeVerdict,
        setActiveVerdict,
        focusPath,
        focusProject: setFocusPath,
        clearFocus: () => setFocusPath(null),
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
