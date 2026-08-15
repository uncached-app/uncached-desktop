import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type Launcher = {
  id: string;
  name: string;
  kind: "editor" | "terminal";
  /** What the platform's launcher understands. Never built in the frontend. */
  program: string;
  /** Project kinds this editor is built for; empty means general-purpose. */
  specialises: string[];
};

/**
 * The editors that make sense for this project, best first.
 *
 * The specialist for the language leads, then anything general-purpose, then
 * the specialists for other languages. Xcode is why: every Mac with developer
 * tools has it, so on a machine with no other editor installed it was the only
 * thing offered for a React project — a true answer to "what can open this" and
 * a useless one.
 *
 * Within each band the backend's own order holds, which puts the editors
 * someone went and installed above the ones that came with the machine.
 */
export function editorsFor(launchers: Launcher[], projectKind: string): Launcher[] {
  const band = (launcher: Launcher) => {
    if (launcher.specialises.length === 0) return 1;
    return launcher.specialises.includes(projectKind) ? 0 : 2;
  };
  return launchers
    .filter((launcher) => launcher.kind === "editor")
    .map((launcher, position) => ({ launcher, position }))
    .sort((left, right) => band(left.launcher) - band(right.launcher) || left.position - right.position)
    .map((entry) => entry.launcher);
}

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
