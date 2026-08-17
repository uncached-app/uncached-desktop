import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RunningProject, WorkspaceProject } from "../types/workspace";

const NONE: Record<string, RunningProject> = {};

/**
 * Which projects have something live inside them.
 *
 * Asked once for the whole workspace and before anything is weighed, because
 * the answer decides whether weighing is worth doing: a project with a dev
 * server in it is being written to while it is read, so the number would be
 * stale before it arrived and the removal it would justify is one the system
 * will refuse.
 *
 * `checked` is the useful signal, not `Object.keys(...).length`: no projects
 * running and not having looked yet are the same map and different facts, and
 * the measurement pass has to wait for the second to become the first.
 */
export function useRunningProjects(projects: WorkspaceProject[]) {
  const [running, setRunning] = useState<Record<string, RunningProject>>(NONE);
  const [checked, setChecked] = useState(false);
  // Guards against an answer landing in a workspace the user has left.
  const generation = useRef(0);

  const paths = projects.map((project) => project.path).join("\n");

  const check = useCallback(async (list: string[]) => {
    generation.current += 1;
    const current = generation.current;
    if (!isTauri() || list.length === 0) {
      setRunning(NONE);
      setChecked(true);
      return;
    }
    setChecked(false);
    try {
      const reported = await invoke<RunningProject[]>("running_projects", { paths: list });
      if (generation.current !== current) return;
      setRunning(Object.fromEntries(reported.map((project) => [project.path, project])));
    } catch {
      // Nothing known to be running, which is what every caller assumes of a
      // project this does not mention. A listing the platform would not give
      // is not a reason to stop the workspace from being read.
      if (generation.current !== current) return;
      setRunning(NONE);
    } finally {
      if (generation.current === current) setChecked(true);
    }
  }, []);

  useEffect(() => {
    void check(paths.length === 0 ? [] : paths.split("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths]);

  return {
    running,
    checked,
    /** Re-reads the listing, for after the user has stopped something. */
    refresh: () => void check(paths.length === 0 ? [] : paths.split("\n")),
  };
}
