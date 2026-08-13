import { createContext, useContext, type ReactNode } from "react";
import { useWorkspaceIndex } from "./useWorkspaceIndex";
import { useWorkspaceFootprints } from "./useWorkspaceFootprints";
import { useWorkspaceVerdicts } from "./useWorkspaceVerdicts";
import type { WorkspaceProject } from "../types/workspace";

const NO_PROJECTS: WorkspaceProject[] = [];

type WorkspaceSession = ReturnType<typeof useWorkspaceIndex> &
  ReturnType<typeof useWorkspaceFootprints> & { verdicts: ReturnType<typeof useWorkspaceVerdicts> };

const WorkspaceSessionContext = createContext<WorkspaceSession | null>(null);

/**
 * Holds the index and the measured footprints above the module, so leaving the
 * Workspace and coming back does not re-walk every project.
 */
export function WorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const index = useWorkspaceIndex();
  const projects = index.index?.projects ?? NO_PROJECTS;
  const footprints = useWorkspaceFootprints(projects);
  const verdicts = useWorkspaceVerdicts(projects, footprints.footprints);
  return (
    <WorkspaceSessionContext.Provider value={{ ...index, ...footprints, verdicts }}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession(): WorkspaceSession {
  const session = useContext(WorkspaceSessionContext);
  if (!session) throw new Error("useWorkspaceSession must be used inside WorkspaceSessionProvider");
  return session;
}
