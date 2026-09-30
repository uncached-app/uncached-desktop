import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Footprint } from "../types/workspace";

/**
 * Hands the workspace's reclaimable total to the tray once measuring settles.
 * Sent only then: mid-measure totals would rebuild the native menu for every
 * project weighed.
 */
export function useTraySummary(footprints: Record<string, Footprint>, measuring: boolean): void {
  useEffect(() => {
    if (!isTauri() || measuring) return;
    const measured = Object.values(footprints);
    const reclaimableBytes =
      measured.length > 0 ? measured.reduce((sum, footprint) => sum + footprint.reclaimableBytes, 0) : null;
    void invoke("set_tray_summary", { reclaimableBytes }).catch(() => {
      // The tray keeps its previous figure; nothing on screen depends on this.
    });
  }, [footprints, measuring]);
}
