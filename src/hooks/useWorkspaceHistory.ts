import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Footprint, WorkspaceProject } from "../types/workspace";

/** What moved between the last visit and this one. */
export type WorkspaceChange = {
  since: string;
  totalDelta: number;
  reclaimableDelta: number;
  projectsAdded: number;
  projectsRemoved: number;
};

export type CleanupTotals = {
  allTimeBytes: number;
  last30DaysBytes: number;
  cleanups: number;
  firstRecordedAt: string | null;
};

/**
 * Reads what changed since the last visit, and records this one.
 *
 * Recorded once per session, and only once every project has been weighed: a
 * snapshot taken while measurement is still running would store a workspace
 * that is smaller than the real one, and the next visit would report growth
 * that never happened.
 *
 * The native layer returns nothing at all on Free, where none of this is
 * written down. There is no branch here for that — an absent record and an
 * absent plan produce the same empty state.
 */
export function useWorkspaceHistory(
  projects: WorkspaceProject[],
  footprints: Record<string, Footprint>,
  measuring: boolean,
) {
  const [change, setChange] = useState<WorkspaceChange | null>(null);
  const [totals, setTotals] = useState<CleanupTotals | null>(null);
  const recorded = useRef(false);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<CleanupTotals>("cleanup_totals").then(setTotals).catch(() => setTotals(null));
  }, []);

  const measured = projects.filter((project) => footprints[project.path]).length;
  const complete = projects.length > 0 && measured === projects.length && !measuring;

  useEffect(() => {
    if (recorded.current || !complete || !isTauri()) return;
    recorded.current = true;
    const weights = projects.map((project) => ({
      path: project.path,
      totalBytes: footprints[project.path]?.totalBytes ?? 0,
      reclaimableBytes: footprints[project.path]?.reclaimableBytes ?? 0,
    }));
    invoke<WorkspaceChange | null>("record_workspace_visit", { projects: weights })
      .then(setChange)
      .catch(() => setChange(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  return { change, totals };
}
