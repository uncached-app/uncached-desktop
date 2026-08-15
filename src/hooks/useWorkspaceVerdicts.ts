import { useEffect, useRef, useState } from "react";
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
 *
 * Asked again when the answer would change. It used to skip any project that
 * already had one, which is a cache keyed on the question having been asked
 * rather than on what it was asked about — so a project stayed `Protect` for
 * the life of the window after the push that made it `Safe`, and a weight that
 * settled later never reached the verdict it decides. The verdict is a pure
 * function of five scalars; those five are the key.
 */
export function useWorkspaceVerdicts(
  projects: WorkspaceProject[],
  footprints: Record<string, Footprint>,
): Record<string, Verdict> {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  // What each answer was an answer to. In a ref because it is bookkeeping for
  // the effect and not something the screen renders.
  const answered = useRef(new Map<string, string>());

  useEffect(() => {
    if (!isTauri()) return;
    let current = true;

    const asked = projects
      .filter((project) => footprints[project.path])
      .map((project) => ({
        input: {
          path: project.path,
          recoverability: project.git.recoverability.level,
          activity: project.activity.state,
          reclaimableBytes: footprints[project.path].reclaimableBytes,
          installMissing: project.installMissing,
          installStale: project.installStale,
        },
      }))
      .map(({ input }) => ({ input, key: signature(input) }));

    // A project that has left the index takes its answer with it, or a folder
    // dropped and chosen again would be read from a verdict nothing measured.
    const present = new Set(projects.map((project) => project.path));
    for (const path of [...answered.current.keys()]) {
      if (!present.has(path)) answered.current.delete(path);
    }

    const pending = asked.filter(({ input, key }) => answered.current.get(input.path) !== key);
    if (pending.length === 0) return;

    void invoke<Array<[string, Verdict]>>("assess_projects", {
      projects: pending.map(({ input }) => input),
    }).then((settled) => {
      if (!current || settled.length === 0) return;
      for (const { input, key } of pending) answered.current.set(input.path, key);
      setVerdicts((previous) => ({ ...previous, ...Object.fromEntries(settled) }));
    });

    return () => {
      current = false;
    };
  }, [projects, footprints]);

  return verdicts;
}

/** The five scalars the answer is a function of, as one comparable string. */
function signature(input: {
  recoverability: string | null;
  activity: string;
  reclaimableBytes: number;
  installMissing: boolean;
  installStale: boolean;
}): string {
  return [
    input.recoverability ?? "unknown",
    input.activity,
    input.reclaimableBytes,
    input.installMissing,
    input.installStale,
  ].join("|");
}
