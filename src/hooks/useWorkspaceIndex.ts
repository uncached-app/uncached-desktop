import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { WorkspaceIndex } from "../types/workspace";

export function useWorkspaceIndex(proEnabled: boolean, rootPath: string) {
  const [index, setIndex] = useState<WorkspaceIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function scanRoot() {
    if (!proEnabled) {
      setError("Uncached Workspace requires Pro.");
      return;
    }
    if (!rootPath.trim()) {
      setError("Select or paste a folder path first.");
      return;
    }
    if (!isTauri()) {
      setError("Tauri runtime unavailable. Start the app with `pnpm tauri dev`.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setIndex(await invoke<WorkspaceIndex>("scan_workspace_index", { path: rootPath.trim() }));
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : JSON.stringify(scanError));
    } finally {
      setLoading(false);
    }
  }

  return { index, loading, error, scanRoot };
}
