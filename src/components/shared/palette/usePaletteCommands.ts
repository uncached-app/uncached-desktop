import { Compass, FolderOpen, FolderPlus, HardDrive, PanelsTopLeft, RefreshCw, Settings, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePurgeFlow } from "../../../hooks/usePurgeFlow";
import { useProjectActions, withOneEditor } from "../../../hooks/useProjectActions";
import { folderActions } from "../../../hooks/useFolderActions";
import { useLaunchers } from "../../../hooks/useLaunchers";
import { useSettings } from "../../../hooks/useSettings";
import { formatBytes } from "../../../utils/format.mjs";
import { folderName } from "../../../utils/folderName";
import type { PaletteItem } from "../../../utils/palette.d.mts";
import type { AppModule } from "../../../types/module";
import type { WorkspaceProject } from "../../../types/workspace";

export type PaletteCommand = PaletteItem & {
  icon: LucideIcon;
  /** Right-hand text: a size, a repository, a hint. */
  detail?: string;
  /** Whether running it should close the palette. */
  closes: boolean;
  run: () => Promise<void> | void;
};

/**
 * What the palette can offer, at each of its two levels.
 *
 * Separated from the palette itself because these are two different jobs: this
 * decides what the app can do, and the component decides how a list of things
 * behaves under a keyboard. Neither needs to be read to change the other.
 *
 * Nothing here is authorized in the frontend. Opening a folder is a native
 * command that checks the path against the folders the user chose.
 */
export function usePaletteCommands({
  scope,
  onScope,
  onModuleChange,
  onOpenSettings,
}: {
  /** The project whose actions are showing, if the palette is at that level. */
  scope: WorkspaceProject | null;
  onScope: (project: WorkspaceProject) => void;
  onModuleChange: (module: AppModule) => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const flow = usePurgeFlow();
  const actions = useProjectActions(scope);
  const projects = flow.index.index?.projects ?? [];
  const launchers = useLaunchers();
  const { settings } = useSettings();
  const roots = flow.extraRoots;

  const projectCommands = useMemo<PaletteCommand[]>(() => {
    if (!scope) return [];
    return [
      {
        id: "page",
        group: "actions",
        title: t("shell.palette.commands.projectPage"),
        keywords: ["details", "git", "artifacts", "everything"],
        icon: PanelsTopLeft,
        closes: true,
        run: () => {
          onModuleChange("reclaim");
          flow.setView("projects");
          flow.openProject(scope.path);
        },
      },
      // The same verbs the project page offers, from one definition. Two lists
      // would drift the first time one of them gained an entry.
      ...actions.map((action) => ({
        id: action.id,
        group: "actions",
        title: action.title,
        detail: action.detail,
        keywords: action.keywords,
        icon: action.icon,
        closes: action.leaves,
        run: action.perform,
      })),
      {
        id: "focus",
        group: "actions",
        title: t("shell.palette.commands.showInWorkspace"),
        keywords: ["find", "list", "map", "locate", "scroll"],
        icon: Compass,
        closes: true,
        // Asking rather than navigating. Getting to the right screen is the
        // easy half; the list is the only thing that knows which filter is
        // currently hiding the row, so it is what answers the request.
        run: () => {
          onModuleChange("reclaim");
          flow.setView("projects");
          flow.closeProject();
          flow.focusProject(scope.path);
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, scope, actions]);

  const rootCommands = useMemo<PaletteCommand[]>(() => {
    const items: PaletteCommand[] = projects.map((project) => ({
      id: `project:${project.path}`,
      group: "projects",
      title: project.name,
      subtitle: project.path,
      keywords: [project.kind, project.git.branch ?? "", flow.verdicts[project.path] ?? ""],
      detail: flow.footprints[project.path]
        ? formatBytes(flow.footprints[project.path].totalBytes)
        : undefined,
      icon: FolderOpen,
      // Selecting a project opens its actions rather than doing something:
      // there is no single obvious verb for "a project", and guessing one
      // would be the palette deciding for the user.
      closes: false,
      run: () => onScope(project),
    }));

    // The chosen folders themselves, with the verbs a project already had.
    // Without these the only way to stand in your own workspace directory was
    // to leave for Finder, which is the gesture this app exists to replace.
    for (const root of roots) {
      const name = folderName(root);
      for (const action of withOneEditor(
        folderActions(
          t,
          launchers ?? [],
          root,
          settings?.preferredEditor ?? null,
          settings?.preferredTerminal ?? null,
        ),
      )) {
        items.push({
          id: `folder:${root}:${action.id}`,
          group: "folders",
          title: t("shell.palette.folderAction", { action: action.title, name }),
          subtitle: root,
          keywords: [...action.keywords, name, "workspace", "root"],
          icon: action.icon,
          closes: action.leaves,
          run: action.perform,
        });
      }
    }

    items.push(
      {
        id: "go-workspace",
        group: "commands",
        title: t("shell.palette.commands.goWorkspace"),
        keywords: ["projects", "map"],
        icon: Compass,
        closes: true,
        // The reading is named as well as the module. Without this it lands on
        // whichever of the two was open last, so "Go to Workspace" and the
        // Workspace button in the bar would mean different things.
        run: () => {
          onModuleChange("reclaim");
          flow.setView("projects");
        },
      },
      {
        id: "go-reclaim",
        group: "commands",
        title: t("shell.palette.commands.reclaim"),
        keywords: ["artifacts", "clean", "free", "remove", "targets"],
        icon: HardDrive,
        closes: true,
        run: () => {
          onModuleChange("reclaim");
          flow.setView("artifacts");
        },
      },
      {
        id: "go-insights",
        group: "commands",
        title: t("shell.palette.commands.goInsights"),
        keywords: ["history", "report", "reclaimed"],
        icon: Compass,
        closes: true,
        run: () => onModuleChange("insights"),
      },
      {
        id: "go-dependencies",
        group: "commands",
        title: t("shell.palette.commands.goDependencies"),
        keywords: ["packages", "unused", "npm", "cargo"],
        icon: Compass,
        closes: true,
        run: () => onModuleChange("dependencies"),
      },
      {
        id: "go-maintenance",
        group: "commands",
        title: t("shell.palette.commands.goMaintenance"),
        keywords: ["policy", "schedule", "automatic"],
        icon: Compass,
        closes: true,
        run: () => onModuleChange("intelligence"),
      },
      {
        id: "add-folder",
        group: "commands",
        title: t("shell.palette.commands.addFolder"),
        keywords: ["root", "workspace", "choose", "scan"],
        icon: FolderPlus,
        closes: true,
        run: () => flow.pickRoot(),
      },
      {
        id: "rescan",
        group: "commands",
        title: t("shell.palette.commands.rescan"),
        keywords: ["refresh", "rescan", "read again"],
        icon: RefreshCw,
        closes: true,
        run: () => flow.startScan(),
      },
      {
        id: "settings",
        group: "commands",
        title: t("shell.palette.commands.settings"),
        keywords: ["preferences", "ignore rules", "licence"],
        icon: Settings,
        closes: true,
        run: () => onOpenSettings(),
      },
    );

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, projects, flow.footprints, flow.verdicts, roots, launchers, settings]);

  return { projectCommands, rootCommands };
}
