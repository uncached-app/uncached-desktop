import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type UserTheme = {
  id: string;
  name: string;
  base: "light" | "dark";
  /** Token name without the `--theme-` prefix, to a colour. */
  colors: Array<[string, string]>;
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
