import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useScanWorkspace } from "./useScanWorkspace";
import { useWorkspaceIndex } from "./useWorkspaceIndex";
import { useWorkspaceFootprints } from "./useWorkspaceFootprints";
import { useWorkspaceVerdicts } from "./useWorkspaceVerdicts";
import type { CleanMode } from "../types/settings";
import type { WorkspaceProject } from "../types/workspace";

const NO_PROJECTS: WorkspaceProject[] = [];

type PurgeFlow = ReturnType<typeof useScanWorkspace> & {
  index: ReturnType<typeof useWorkspaceIndex>;
  footprints: Record<string, import("../types/workspace").Footprint>;
  measuring: boolean;
  verdicts: ReturnType<typeof useWorkspaceVerdicts>;
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

  return (
    <PurgeFlowContext.Provider value={{ ...flow, index, footprints, measuring, verdicts }}>
      {children}
    </PurgeFlowContext.Provider>
  );
}

export function usePurgeFlow(): PurgeFlow {
  const flow = useContext(PurgeFlowContext);
  if (!flow) throw new Error("usePurgeFlow must be used inside PurgeFlowProvider");
  return flow;
}
