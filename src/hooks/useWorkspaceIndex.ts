import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { WorkspaceIndex } from "../types/workspace";
import { describeFailure } from "../i18n/errors";

/** How long an index is trusted before a focus is allowed to re-read it. */
const STALE_AFTER_MS = 5 * 60 * 1000;

/** Indexes the roots it is given. Free on every plan; Rust caps how many apply. */
export function useWorkspaceIndex() {
  const { t } = useTranslation();
  const [index, setIndex] = useState<WorkspaceIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const indexedAt = useRef(0);
  const running = useRef(false);

  function clearIndex() {
    setIndex(null);
    setError(null);
    indexedAt.current = 0;
  }

  async function scanRoots(paths: string[]) {
    if (paths.length === 0) {
      setError(t("shell.index.noFolder"));
      return;
    }
    if (!isTauri()) {
      setError("Tauri runtime unavailable. Start the app with `pnpm tauri dev`.");
      return;
    }
    if (running.current) return;
    running.current = true;
    setLoading(true);
    setError(null);
    try {
      setIndex(await invoke<WorkspaceIndex>("scan_workspace_index", { paths }));
      indexedAt.current = Date.now();
    } catch (scanError) {
      setError(describeFailure(scanError));
    } finally {
      running.current = false;
      setLoading(false);
    }
  }

  /**
   * Re-reads the roots only if the index has had time to drift. Projects change
   * while the app is in the background, and a read the user did not ask for has
   * to stay cheap enough that it is never the reason the window feels busy.
   */
  async function refreshIfStale(paths: string[]) {
    if (running.current) return;
    if (Date.now() - indexedAt.current < STALE_AFTER_MS) return;
    await scanRoots(paths);
  }

  return { index, loading, error, scanRoots, refreshIfStale, clearIndex };
}
