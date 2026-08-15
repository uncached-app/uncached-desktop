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
 *
 * Asked for as a batch. The answer is a pure function of five scalars, and one
 * call per project meant a round trip each — up to two hundred and fifty of
 * them, to run a function that touches nothing. Weights arrive a few at a time,
 * so this settles in about as many calls as there are batches.
 *
 * The path is echoed back by the backend rather than zipped against the request
 * here: matching on order would be correct until the day something reorders the
 * reply, and a verdict attached to the wrong project is the one mistake this
 * screen must not make.
 */
export function useWorkspaceVerdicts(
  projects: WorkspaceProject[],
  footprints: Record<string, Footprint>,
): Record<string, Verdict> {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});

  useEffect(() => {
    if (!isTauri()) return;
    let current = true;

    const pending = projects
      .filter((project) => footprints[project.path] && !verdicts[project.path])
      .map((project) => ({
        path: project.path,
        recoverability: project.git.recoverability.level,
        activity: project.activity.state,
        reclaimableBytes: footprints[project.path].reclaimableBytes,
        installMissing: project.installMissing,
        installStale: project.installStale,
      }));
    if (pending.length === 0) return;

    void invoke<Array<[string, Verdict]>>("assess_projects", { projects: pending }).then(
      (settled) => {
        if (!current || settled.length === 0) return;
        setVerdicts((previous) => ({ ...previous, ...Object.fromEntries(settled) }));
      },
    );

    return () => {
      current = false;
    };
    // `verdicts` is deliberately absent: it is written by this effect, and
    // reading it here would re-run on every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, footprints]);

  return verdicts;
}
