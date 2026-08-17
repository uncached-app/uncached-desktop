import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Footprint, WorkspaceProject } from "../types/workspace";

/** How many projects to measure at once. */
const CONCURRENCY = 4;

/**
 * Measures each project after the list is on screen, so the map fills in behind
 * itself.
 *
 * A project with a process working inside it is skipped rather than measured.
 * The tree is being written to while it would be read, so the weight would be
 * stale on arrival — and it would be presented as reclaimable next to a Clean
 * the system is going to refuse. The row says the project is running instead,
 * which is the true answer and the one the user can act on.
 */
export function useWorkspaceFootprints(
  projects: WorkspaceProject[],
  running: Record<string, unknown> = {},
  /** Whether the listing has been taken. Measuring waits for it. */
  runningChecked = true,
) {
  const [footprints, setFootprints] = useState<Record<string, Footprint>>({});
  const [measuring, setMeasuring] = useState(false);
  // Guards against an in-flight measurement writing into a workspace the user left.
  const generation = useRef(0);
  const skip = Object.keys(running).join("\n");

  useEffect(() => {
    generation.current += 1;
    const current = generation.current;
    if (!isTauri() || projects.length === 0 || !runningChecked) {
      setMeasuring(false);
      return;
    }

    const held = new Set(skip.length === 0 ? [] : skip.split("\n"));
    const queue = projects
      .map((project) => project.path)
      .filter((path) => !held.has(path));
    if (queue.length === 0) {
      setMeasuring(false);
      return;
    }
    let next = 0;
    setMeasuring(true);

    async function worker() {
      while (next < queue.length) {
        const path = queue[next++];
        try {
          const footprint = await invoke<Footprint>("measure_project_footprint", { path });
          if (generation.current !== current) return;
          setFootprints((previous) => ({ ...previous, [path]: footprint }));
        } catch {
          // Leave it unmeasured rather than claiming zero.
          if (generation.current !== current) return;
        }
      }
    }

    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker)).then(() => {
      if (generation.current === current) setMeasuring(false);
    });

    return () => { generation.current += 1; };
  }, [projects, skip, runningChecked]);

  // Re-reads one project, for after something under it was removed. The
  // generation check is the same one the sweep uses: a measurement that lands
  // after the user changed workspace must not write into the new one.
  const remeasure = useCallback(async (path: string) => {
    if (!isTauri()) return;
    const current = generation.current;
    try {
      const footprint = await invoke<Footprint>("measure_project_footprint", { path });
      if (generation.current !== current) return;
      setFootprints((previous) => ({ ...previous, [path]: footprint }));
    } catch {
      // Keep the last good reading rather than replacing it with a claim.
    }
  }, []);

  return { footprints, measuring, remeasure };
}
