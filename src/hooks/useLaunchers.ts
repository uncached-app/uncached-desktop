import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type Launcher = {
  id: string;
  name: string;
  kind: "editor" | "terminal";
  /** What the platform's launcher understands. Never built in the frontend. */
  program: string;
};

/**
 * The editors and terminals this machine actually has.
 *
 * Asked once. The alternative — a setting where you type the name of your
 * editor — makes the user do the one thing the machine can answer by looking,
 * and gets it wrong the first time someone spells it differently.
 */
export function useLaunchers() {
  const [launchers, setLaunchers] = useState<Launcher[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<Launcher[]>("available_launchers")
      .then(setLaunchers)
      .catch(() => setLaunchers([]));
  }, []);

  return launchers;
}
