import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type UserTheme = {
  id: string;
  name: string;
  /**
   * What it offers for each mode, token name to colour. A theme may carry one
   * or both, and which it carries decides whether the appearance choice is
   * still the user's: a file of only dark colours cannot honour a request for
   * light.
   */
  light: Array<[string, string]> | null;
  dark: Array<[string, string]> | null;
  /** Lines that named nothing, or named a colour that is not one. */
  problems: string[];
  /** Shipped with the app rather than found in the folder. */
  builtIn: boolean;
};

/**
 * The themes the app ships with, and the ones in the user's config folder.
 *
 * Re-read when the window comes back, because the way anyone writes one of
 * these is to open the folder, edit a file, and come back — the same gesture
 * the workspace index already treats as a reason to look again. A watcher would
 * be a dependency and a background thread to catch a change the user is about
 * to walk in front of anyway.
 */
export function useThemeFiles() {
  const [themes, setThemes] = useState<UserTheme[]>([]);

  const read = useCallback(() => {
    if (!isTauri()) return;
    void invoke<UserTheme[]>("list_themes")
      .then(setThemes)
      .catch(() => setThemes([]));
  }, []);

  useEffect(() => {
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [read]);

  return { themes, refresh: read };
}
