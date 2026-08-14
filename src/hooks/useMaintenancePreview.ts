import { useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { EMPTY_PREVIEW, type MaintenanceCandidate, type MaintenancePolicy, type MaintenancePreview } from "../types/maintenance";
import type { Footprint, Verdict, WorkspaceProject } from "../types/workspace";

/**
 * What the policy would select, asked of Rust once the numbers have settled.
 *
 * Weights arrive a few projects at a time and verdicts follow them, so a
 * preview computed on every answer would count up in front of the user and read
 * as a total that keeps changing its mind. It waits instead, and the screen says
 * it is waiting — an unmeasured project is unknown, not empty, and a selection
 * drawn from half the workspace is a different selection.
 */
export function useMaintenancePreview({
  projects,
  footprints,
  verdicts,
  measuring,
  policy,
}: {
  projects: WorkspaceProject[];
  footprints: Record<string, Footprint>;
  verdicts: Record<string, Verdict>;
  measuring: boolean;
  policy: MaintenancePolicy;
}) {
  const [preview, setPreview] = useState<MaintenancePreview>(EMPTY_PREVIEW);
  const [error, setError] = useState<string | null>(null);

  // A project that was measured but not yet judged would read as `unknown` and
  // be skipped for the wrong reason. One that failed to measure never gets a
  // verdict at all, so it is not something to wait for.
  const awaitingVerdicts = projects.some(
    (project) => footprints[project.path] && !verdicts[project.path],
  );
  const settling = measuring || awaitingVerdicts;

  const measured = projects.filter((project) => footprints[project.path]).length;

  const candidates: MaintenanceCandidate[] = useMemo(
    () =>
      projects.map((project) => ({
        path: project.path,
        name: project.name,
        verdict: verdicts[project.path] ?? "unknown",
        idleDays: project.activity.idleDays,
        reclaimableBytes: footprints[project.path]?.reclaimableBytes ?? null,
      })),
    [projects, footprints, verdicts],
  );

  useEffect(() => {
    if (!isTauri() || settling) return;
    if (candidates.length === 0) {
      setPreview(EMPTY_PREVIEW);
      setError(null);
      return;
    }
    let current = true;
    invoke<MaintenancePreview>("preview_maintenance", { candidates, policy })
      .then((next) => {
        if (!current) return;
        setPreview(next);
        setError(null);
      })
      .catch((previewError) => {
        if (!current) return;
        // Left as the last good answer rather than replaced by an empty one: a
        // selection that vanishes on a failed call is a selection that lies.
        setError(previewError instanceof Error ? previewError.message : String(previewError));
      });
    return () => {
      current = false;
    };
  }, [candidates, policy, settling]);

  // Handed back so a run can be asked for using the very list the preview was
  // drawn from. Rust decides the selection either way; sending the same input
  // is what makes the button's promise and the run's behaviour the same thing.
  return { preview, candidates, settling, measured, error };
}
