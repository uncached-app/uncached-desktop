import { invoke } from "@tauri-apps/api/core";
import { Clipboard, FolderOpen, SquarePen, SquareTerminal } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { editorsFor, preferred, useLaunchers, type Launcher } from "./useLaunchers";
import { useSettings } from "./useSettings";
import { copyText } from "../utils/clipboard";
import type { ProjectAction } from "./useProjectActions";

/**
 * Everything you can do with a folder that is not a project.
 *
 * A workspace root and a folder holding several projects were the two things
 * on screen you could look at and not act on. Every project had an editor, a
 * terminal and a reveal; the folder containing them had nothing, so the one
 * gesture the app could not answer — "I want to be *in* there" — sent people to
 * Finder, and a map you cannot work from is a picture.
 *
 * The same shape as a project's actions, and deliberately a subset of them:
 * fetching and opening a repository belong to a project, and a folder full of
 * projects has no single repository to mean.
 *
 * Nothing is authorized here. Each of these is a native command that checks the
 * path against the folders the user chose — and that check already accepted a
 * root, because `inside_a_root` tests the root itself before it tests what is
 * under it. This is interface reaching a capability that was already there.
 */
export function useFolderActions(path: string | null): ProjectAction[] {
  const { t } = useTranslation();
  const launchers = useLaunchers();
  const { settings } = useSettings();
  const preferredEditor = settings?.preferredEditor ?? null;
  const preferredTerminal = settings?.preferredTerminal ?? null;

  return useMemo(
    () => (path ? folderActions(t, launchers ?? [], path, preferredEditor, preferredTerminal) : []),
    [t, path, launchers, preferredEditor, preferredTerminal],
  );
}

/**
 * The same verbs, without being a hook.
 *
 * The palette offers them for every chosen folder at once, and a hook cannot be
 * called in a loop. Both callers read the same list from the same place.
 */
export function folderActions(
  t: TFunction,
  launchers: Launcher[],
  path: string,
  preferredEditor: string | null,
  preferredTerminal: string | null,
): ProjectAction[] {
  const actions: ProjectAction[] = [];

  // No kind to specialise for: a folder is not written in a language. Every
  // general-purpose editor leads, and the specialists sort below them —
  // which is `editorsFor` doing what it already does for a project whose
  // kind nothing specialises in.
  const editors = preferred(editorsFor(launchers, ""), preferredEditor);
  for (const launcher of editors) {
    actions.push({
      id: `open-${launcher.id}`,
      title: t("shell.actions.openIn", { app: launcher.name }),
      keywords: ["edit", "editor", "folder", launcher.name],
      icon: SquarePen,
      leaves: true,
      perform: () => invoke("open_project_with", { path, program: launcher.program }),
    });
  }

  const [terminal] = preferred(
    launchers.filter((entry) => entry.kind === "terminal"),
    preferredTerminal,
  );
  if (terminal) {
    actions.push({
      id: "open-terminal",
      title: t("shell.actions.openIn", { app: terminal.name }),
      keywords: ["shell", "terminal", "cd", "folder"],
      icon: SquareTerminal,
      leaves: true,
      perform: () => invoke("open_project_with", { path, program: terminal.program }),
    });
  }

  actions.push({
    id: "reveal",
    title: t("shell.actions.reveal"),
    keywords: ["finder", "explorer", "folder", "show"],
    icon: FolderOpen,
    leaves: true,
    perform: () => invoke("reveal_project", { path }),
  });

  actions.push({
    id: "copy",
    title: t("shell.actions.copyPath"),
    detail: path,
    keywords: ["clipboard", "path"],
    // The one verb whose result is right here, so the caller stays put and
    // says it happened. A copy with no evidence gets pressed twice.
    leaves: false,
    icon: Clipboard,
    perform: () => copyText(path),
  });

  return actions;
}
