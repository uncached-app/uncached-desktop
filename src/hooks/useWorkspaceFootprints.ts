import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Footprint, WorkspaceProject } from "../types/workspace";

/** How many projects to measure at once. */
const CONCURRENCY = 4;

/**
 * Measures each project's disk usage after the list is already on screen.
 *
 * Discovery returns in milliseconds; walking every byte of two hundred
 * projects does not. Measuring here, one project at a time, is what lets the
 * map be readable immediately and fill in behind itself — the alternative is a
 * spinner over an empty screen for however long the largest workspace takes.
 *
 * Results are keyed by path and kept across re-indexes, so a project that has
 * not changed does not lose its weight while the rest are re-measured.
 */
export function useWorkspaceFootprints(projects: WorkspaceProject[]) {
  const [footprints, setFootprints] = useState<Record<string, Footprint>>({});
  const [measuring, setMeasuring] = useState(false);
  // Bumped on unmount and on every new project list, so a measurement that is
  // still in flight cannot write into the state of a workspace the user left.
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    const current = generation.current;
    if (!isTauri() || projects.length === 0) {
      setMeasuring(false);
      return;
    }

    const queue = projects.map((project) => project.path);
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
          // A project that cannot be measured keeps whatever it had. Its row
          // reads "not measured", which is true, rather than zero, which is not.
          if (generation.current !== current) return;
        }
      }
    }

    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker)).then(() => {
      if (generation.current === current) setMeasuring(false);
    });

    return () => { generation.current += 1; };
  }, [projects]);

  return { footprints, measuring };
}
