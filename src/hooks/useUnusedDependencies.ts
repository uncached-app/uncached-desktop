import { useCallback, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ProjectDependencies } from "../types/dependencies";
import { describeFailure } from "../i18n/errors";

/**
 * Declared dependencies nothing in each project names.
 *
 * Taken when the module is opened, not with the scan: it reads every source
 * file of every project, and nothing else on screen waits for it.
 * `describes` is the project list the current answer was taken for, so a
 * changed workspace is re-read and the same one is not.
 */
export function useUnusedDependencies(projectPaths: string[]) {
  const [projects, setProjects] = useState<ProjectDependencies[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [describes, setDescribes] = useState<string | null>(null);
  const workspace = projectPaths.join("\n");

  const scan = useCallback(async () => {
    if (!isTauri() || projectPaths.length === 0) return;
    setRunning(true);
    setError(null);
    setDescribes(workspace);
    try {
      setProjects(await invoke<ProjectDependencies[]>("unused_dependencies", { paths: projectPaths }));
    } catch (scanError) {
      setError(describeFailure(scanError));
      setProjects([]);
    } finally {
      setRunning(false);
    }
  }, [projectPaths, workspace]);

  return {
    projects,
    running,
    error,
    scan,
    /** Whether the answer on screen was taken for the current workspace. */
    current: describes === workspace,
  };
}
