import { useCallback, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { EMPTY_WORKSPACE_HYGIENE, type WorkspaceHygiene } from "../types/hygiene";
import { describeFailure } from "../i18n/errors";

/**
 * What every repository in the workspace is carrying that nothing uses.
 *
 * Asked for rather than run on arrival: this is four `git` invocations per
 * repository, and on a workspace of forty that is a hundred and sixty processes
 * nobody requested.
 *
 * The per-project panel keeps its own reading. This one answers "which
 * repositories should I even open", and the acting still happens there — one
 * repository at a time, through a command that re-reads hygiene before it
 * deletes anything.
 */
export function useWorkspaceHygiene(projectPaths: string[]) {
  const [report, setReport] = useState<WorkspaceHygiene | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!isTauri() || projectPaths.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      setReport(await invoke<WorkspaceHygiene>("workspace_hygiene", { paths: projectPaths }));
    } catch (scanError) {
      setError(describeFailure(scanError));
      setReport(EMPTY_WORKSPACE_HYGIENE);
    } finally {
      setRunning(false);
    }
  }, [projectPaths]);

  return { report, running, error, scan };
}
