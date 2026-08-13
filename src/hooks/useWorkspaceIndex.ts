import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { WorkspaceIndex } from "../types/workspace";

/** Indexes the roots it is given. Free on every plan; Rust caps how many apply. */
export function useWorkspaceIndex() {
  const [index, setIndex] = useState<WorkspaceIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearIndex() {
    setIndex(null);
    setError(null);
  }

  async function scanRoots(paths: string[]) {
    if (paths.length === 0) {
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
      setIndex(await invoke<WorkspaceIndex>("scan_workspace_index", { paths }));
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : JSON.stringify(scanError));
    } finally {
      setLoading(false);
    }
  }

  return { index, loading, error, scanRoots, clearIndex };
}
