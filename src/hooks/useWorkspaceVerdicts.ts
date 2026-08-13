import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Footprint, Verdict, WorkspaceProject } from "../types/workspace";

/**
 * Asks Rust for each project's verdict once its footprint is known.
 *
 * Decided there, not here: the verdict is what will authorise automation, and
 * it has to be the same answer whatever asked the question. It waits for the
 * footprint because a project with nothing measured yet would read as having
 * nothing left to reclaim.
 */
export function useWorkspaceVerdicts(
  projects: WorkspaceProject[],
  footprints: Record<string, Footprint>,
): Record<string, Verdict> {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});

  useEffect(() => {
    if (!isTauri()) return;
    let current = true;

    void Promise.all(
      projects
        .filter((project) => footprints[project.path] && !verdicts[project.path])
        .map(async (project) => {
          const verdict = await invoke<Verdict>("assess_project", {
            recoverability: project.git.recoverability.level,
            activity: project.activity.state,
            reclaimableBytes: footprints[project.path].reclaimableBytes,
            installMissing: project.installMissing,
            installStale: project.installStale,
          });
          return [project.path, verdict] as const;
        }),
    ).then((settled) => {
      if (!current || settled.length === 0) return;
      setVerdicts((previous) => ({ ...previous, ...Object.fromEntries(settled) }));
    });

    return () => { current = false; };
    // `verdicts` is deliberately absent: it is written by this effect, and
    // reading it here would re-run on every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, footprints]);

  return verdicts;
}
