import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Footprint, WorkspaceProject } from "../types/workspace";
import type { CleanupEvent } from "../utils/report.d.mts";

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

type CleanupHistory = { events: CleanupEvent[]; totals: CleanupTotals };

const EMPTY: CleanupHistory = {
  events: [],
  totals: { allTimeBytes: 0, last30DaysBytes: 0, cleanups: 0, firstRecordedAt: null },
};

/**
 * Every cleanup this machine has recorded, and the summary of them.
 *
 * Read-only, and separate from the visit recording below, because the report
 * reads this history without being part of it: opening a screen is not an event
 * worth writing down.
 *
 * Free gets the same empty shape an untouched install would — the native layer
 * returns nothing rather than refusing, so there is no error state to render
 * for a plan that simply has no history.
 */
export function useCleanupHistory() {
  const [history, setHistory] = useState<CleanupHistory>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    invoke<CleanupHistory>("cleanup_history")
      .then(setHistory)
      .catch(() => setHistory(EMPTY))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  return { ...history, loading, refresh };
}

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
  const { totals } = useCleanupHistory();
  const recorded = useRef(false);

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
