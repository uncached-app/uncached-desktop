import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ScheduleStatus } from "../types/maintenance";

/**
 * Where the schedule stands, as the backend reports it.
 *
 * Read rather than derived. The screen has the stored schedule already — it
 * comes down with the rest of settings — but the interval in force can differ
 * from the interval stored, and whether a run would start right now depends on
 * the licence, the chosen folders and whether a scan is open. All four are
 * questions the thread answers for itself, so the screen asks the same source
 * instead of assembling a second opinion.
 *
 * Refreshed on a timer because the answer changes without anything on this
 * screen happening: an interval elapses, a run fires, a scan the user started
 * elsewhere ends. A minute is far finer than a schedule measured in days, and
 * the call reads one small file.
 */
const REFRESH_MS = 60 * 1000;

export function useScheduleStatus(enabled: boolean) {
  const [status, setStatus] = useState<ScheduleStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauri() || !enabled) return;
    try {
      setStatus(await invoke<ScheduleStatus>("maintenance_schedule_status"));
    } catch {
      // Left at the last good answer. A status line that blanks out on one
      // failed read is a schedule that looks like it stopped.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return { status, refresh };
}
