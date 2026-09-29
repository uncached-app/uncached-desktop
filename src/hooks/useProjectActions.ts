import { invoke } from "@tauri-apps/api/core";
import {
  Clipboard,
  FolderOpen,
  Globe,
  RefreshCw,
  SquarePen,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { editorsFor, preferred, useLaunchers } from "./useLaunchers";
import { useSettings } from "./useSettings";
import { remoteLabel, remoteToUrl } from "../utils/remoteUrl.mjs";
import { copyText } from "../utils/clipboard";
import { openExternalUrl } from "../utils/externalLink";
import type { WorkspaceProject } from "../types/workspace";

export type ProjectAction = {
  id: string;
  title: string;
  /** Right-hand text: a repository, a path, whatever the verb needs. */
  detail?: string;
  keywords: string[];
  icon: LucideIcon;
  /** True for the ones whose result appears somewhere else entirely. */
  leaves: boolean;
  perform: () => Promise<void>;
};

/**
 * The same list with one editor instead of every installed one.
 *
 * The palette is where you choose between editors — it has a search field and
 * room for the list. Anywhere else, a run of identical pencil icons is a run
 * nobody can read, and `editorsFor` has already put the best one first.
 */
export function withOneEditor(actions: ProjectAction[]): ProjectAction[] {
  const first = actions.findIndex(
    (action) => action.id.startsWith("open-") && action.id !== "open-terminal",
  );
  return actions.filter(
    (action, position) =>
      !action.id.startsWith("open-") || action.id === "open-terminal" || position === first,
  );
}

/**
 * Everything you can do with a project that happens outside this window.
 *
 * Shared rather than written twice: the palette and the project page offer the
 * same verbs, and two lists of them would drift the first time one gained an
 * entry. Navigation is deliberately not here — going to another screen is each
 * caller's own business, and only they know where they are.
 *
 * Nothing is authorized here. Every one of these is a native command that
 * checks the path against the folders the user chose.
 */
export function useProjectActions(project: WorkspaceProject | null): ProjectAction[] {
  const { t } = useTranslation();
  const detected = useLaunchers();
  const { settings } = useSettings();
  const preferredEditor = settings?.preferredEditor ?? null;
  const preferredTerminal = settings?.preferredTerminal ?? null;

  return useMemo(() => {
    if (!project) return [];
    const launchers = detected ?? [];
    const actions: ProjectAction[] = [];

    // Every editor, best first. The action bar shows the first and the palette
    // shows them all — a row of identical pencil icons is a row nobody can read.
    // The chosen one first, then the rest in the order detection ranked them.
    // A preference that names an editor no longer installed is ignored rather
    // than obeyed into an empty list.
    const editors = preferred(editorsFor(launchers, project.kind), preferredEditor);
    for (const launcher of editors) {
      actions.push({
        id: `open-${launcher.id}`,
        title: t("shell.actions.openIn", { app: launcher.name }),
        keywords: ["edit", "editor", launcher.name],
        icon: SquarePen,
        leaves: true,
        perform: () => invoke("open_project_with", { path: project.path, program: launcher.program }),
      });
    }

    // One terminal, not all of them. No platform this runs on exposes a
    // "default terminal" an app could read — macOS has no such setting at all —
    // so detection order is a guess, and Settings is where it stops being one.
    const [terminal] = preferred(
      launchers.filter((entry) => entry.kind === "terminal"),
      preferredTerminal,
    );
    if (terminal) {
      actions.push({
        id: "open-terminal",
        title: t("shell.actions.openIn", { app: terminal.name }),
        keywords: ["shell", "terminal", "cd"],
        icon: SquareTerminal,
        leaves: true,
        perform: () => invoke("open_project_with", { path: project.path, program: terminal.program }),
      });
    }

    actions.push({
      id: "reveal",
      title: t("shell.actions.reveal"),
      keywords: ["finder", "explorer", "folder", "show"],
      icon: FolderOpen,
      leaves: true,
      perform: () => invoke("reveal_project", { path: project.path }),
    });

    actions.push({
      id: "copy",
      title: t("shell.actions.copyPath"),
      detail: project.path,
      keywords: ["clipboard", "path"],
      icon: Clipboard,
      // The one verb whose result is right here, so the caller stays put and
      // says it happened. A copy with no evidence gets pressed twice.
      leaves: false,
      perform: () => copyText(project.path),
    });

    // The only action here that touches the network, and the only one that
    // writes anything into a repository — remote-tracking refs, which the next
    // fetch would rewrite anyway. It never merges: `pull` is deliberately not
    // offered from a palette, where a keystroke could change a working tree.
    if (project.git.remote) {
      actions.push({
        id: "fetch",
        title: t("shell.actions.fetch"),
        detail: remoteLabel(project.git.remote) ?? undefined,
        keywords: ["git", "fetch", "prune", "remote", "behind", "sync"],
        // The result is the repository knowing more, which this window shows
        // next time it reads it. Nothing opens, so the caller stays put.
        leaves: false,
        icon: RefreshCw,
        perform: async () => {
          await invoke("fetch_project", { path: project.path });
        },
      });
    }

    const url = remoteToUrl(project.git.remote);
    if (url) {
      actions.push({
        id: "remote",
        title: t("shell.actions.openRepository"),
        detail: remoteLabel(project.git.remote) ?? undefined,
        keywords: ["github", "git", "remote", "browser"],
        icon: Globe,
        leaves: true,
        perform: async () => openExternalUrl(url),
      });
    }

    return actions;
  }, [t, project, detected, preferredEditor, preferredTerminal]);
}
