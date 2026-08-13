import { createContext, useContext, type ReactNode } from "react";
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
export function PurgeFlowProvider({ cleanMode, children }: { cleanMode: CleanMode; children: ReactNode }) {
  const index = useWorkspaceIndex();
  const flow = useScanWorkspace(cleanMode, index.scanRoots);
  const projects = index.index?.projects ?? NO_PROJECTS;
  const { footprints, measuring } = useWorkspaceFootprints(projects);
  const verdicts = useWorkspaceVerdicts(projects, footprints);

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
