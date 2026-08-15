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
import { editorsFor, useLaunchers } from "./useLaunchers";
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
  const launchers = useLaunchers();

  return useMemo(() => {
    if (!project) return [];
    const actions: ProjectAction[] = [];

    // Every editor, best first. The action bar shows the first and the palette
    // shows them all — a row of identical pencil icons is a row nobody can read.
    for (const launcher of editorsFor(launchers, project.kind)) {
      actions.push({
        id: `open-${launcher.id}`,
        title: `Open in ${launcher.name}`,
        keywords: ["edit", "editor", launcher.name],
        icon: SquarePen,
        leaves: true,
        perform: () => invoke("open_project_with", { path: project.path, program: launcher.program }),
      });
    }

    // One terminal, not all of them. The candidate order puts the deliberate
    // installs first, so whoever went and installed Ghostty gets Ghostty, and
    // everyone else gets the one that shipped with the machine.
    const terminal = launchers.find((entry) => entry.kind === "terminal");
    if (terminal) {
      actions.push({
        id: "open-terminal",
        title: `Open in ${terminal.name}`,
        keywords: ["shell", "terminal", "cd"],
        icon: SquareTerminal,
        leaves: true,
        perform: () => invoke("open_project_with", { path: project.path, program: terminal.program }),
      });
    }

    actions.push({
      id: "reveal",
      title: "Reveal in file manager",
      keywords: ["finder", "explorer", "folder", "show"],
      icon: FolderOpen,
      leaves: true,
      perform: () => invoke("reveal_project", { path: project.path }),
    });

    actions.push({
      id: "copy",
      title: "Copy path",
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
        title: "Fetch from remote",
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
        title: "Open repository",
        detail: remoteLabel(project.git.remote) ?? undefined,
        keywords: ["github", "git", "remote", "browser"],
        icon: Globe,
        leaves: true,
        perform: async () => openExternalUrl(url),
      });
    }

    return actions;
  }, [project, launchers]);
}
