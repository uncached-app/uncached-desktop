import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { WorkspaceIndex } from "../types/workspace";

/**
 * Indexes one or more workspace roots. Available on every plan.
 *
 * The gate used to be here, refusing the whole scan without Pro, and it cost
 * more than it protected: a module nobody can open never shows the 34 GB
 * trapped in cold projects, and nobody wants what they have never seen.
 * Indexing is pure reading — it changes nothing on disk — so the plan boundary
 * moved to the actions that do, and to how many roots may be indexed at once.
 *
 * How many is decided in Rust. This hook sends every root the user picked and
 * renders whatever comes back, including the list of the ones left out.
 */
export function useWorkspaceIndex() {
  const [roots, setRoots] = useState<string[]>([]);
  const [index, setIndex] = useState<WorkspaceIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addRoot(path: string) {
    const trimmed = path.trim();
    if (!trimmed) {
      setError("Select or paste a folder path first.");
      return;
    }
    setError(null);
    setRoots((current) => (current.includes(trimmed) ? current : [...current, trimmed]));
  }

  async function pickAdditionalRoot() {
    if (!isTauri()) {
      setError("Tauri runtime unavailable. Start the app with `pnpm dev`.");
      return;
    }
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") addRoot(selected);
    } catch (pickerError) {
      setError(String(pickerError));
    }
  }

  function removeRoot(path: string) {
    setRoots((current) => current.filter((root) => root !== path));
  }

  function clearRoots() {
    setRoots([]);
    setIndex(null);
    setError(null);
  }

  async function scanRoots(paths: string[] = roots) {
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

  return { roots, addRoot, pickAdditionalRoot, removeRoot, clearRoots, index, loading, error, scanRoots };
}
