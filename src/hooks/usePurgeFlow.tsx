import { createContext, useContext, type ReactNode } from "react";
import { useScanWorkspace } from "./useScanWorkspace";
import type { CleanMode } from "../types/settings";

type PurgeFlow = ReturnType<typeof useScanWorkspace>;

const PurgeFlowContext = createContext<PurgeFlow | null>(null);

/**
 * Holds the scan-and-clean flow above the layout, so the shell can read the
 * current step without every screen's props passing through App.
 */
export function PurgeFlowProvider({ cleanMode, children }: { cleanMode: CleanMode; children: ReactNode }) {
  const flow = useScanWorkspace(cleanMode);
  return <PurgeFlowContext.Provider value={flow}>{children}</PurgeFlowContext.Provider>;
}

export function usePurgeFlow(): PurgeFlow {
  const flow = useContext(PurgeFlowContext);
  if (!flow) throw new Error("usePurgeFlow must be used inside PurgeFlowProvider");
  return flow;
}
