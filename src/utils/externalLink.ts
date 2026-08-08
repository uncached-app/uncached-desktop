import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type React from "react";

/**
 * Safely opens an external URL using the system default browser in Tauri,
 * or window.open in standard browser environments.
 */
export function openExternalUrl(url: string, event?: React.MouseEvent): void {
  if (event) {
    event.preventDefault();
  }
  if (isTauri()) {
    void openUrl(url);
  } else {
    window.open(url, "_blank", "noreferrer");
  }
}
