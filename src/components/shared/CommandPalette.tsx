import {
  ArrowLeft,
  Compass,
  CornerDownLeft,
  FolderOpen,
  FolderPlus,
  PanelsTopLeft,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePurgeFlow } from "../../hooks/usePurgeFlow";
import { useProjectActions } from "../../hooks/useProjectActions";
import { groupCommands, rankCommands } from "../../utils/palette.mjs";
import type { PaletteItem } from "../../utils/palette.d.mts";
import { formatBytes } from "../../utils/format";
import type { AppModule } from "../../types/module";
import type { WorkspaceProject } from "../../types/workspace";

type Command = PaletteItem & {
  icon: typeof Search;
  /** Right-hand text: a size, a repository, a hint. */
  detail?: string;
  run: () => void | Promise<void>;
};

const GROUP_LABELS: Record<string, string> = {
  actions: "Actions",
  projects: "Projects",
  commands: "Commands",
};

/**
 * Everything the app can do, from anywhere, without leaving the keyboard.
 *
 * This is the one screen that is not about disk. A workspace map you can only
 * read is something you open when the disk is full — twice a year. A map you
 * can act from is a launcher, and a launcher gets opened for its own reasons,
 * with the cleaning happening because you were already there.
 *
 * Two levels, not one: pick a project, then pick what to do with it. A flat
 * list of every action for every project would be forty projects times six
 * verbs, which is a list nobody reads.
 *
 * Nothing here is authorized in the frontend. Opening a folder is a native
 * command that checks the path is inside a folder the user chose, and that the
 * application is one this machine was found to have.
 */
export function CommandPalette({
  open,
  project,
  onClose,
  onModuleChange,
  onOpenSettings,
}: {
  open: boolean;
  /** Opened from a row, so it starts at that project's actions. */
  project: WorkspaceProject | null;
  onClose: () => void;
  onModuleChange: (module: AppModule) => void;
  onOpenSettings: () => void;
}) {
  const flow = usePurgeFlow();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<WorkspaceProject | null>(null);
  const [cursor, setCursor] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const projects = flow.index.index?.projects ?? [];

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setScope(project);
    setCursor(0);
    setFlash(null);
    inputRef.current?.focus();
  }, [open, project]);

  async function run(action: () => Promise<void>, closing: boolean) {
    try {
      await action();
      if (closing) onClose();
    } catch (error) {
      // Said out loud rather than swallowed: a folder that moved since the
      // scan is the most likely failure here, and silence would read as a
      // palette that does nothing.
      setFlash(typeof error === "string" ? error : "That did not work");
    }
  }

  const actions = useProjectActions(scope);

  const projectCommands = useMemo<Command[]>(() => {
    if (!scope) return [];
    return [
      {
        id: "page",
        group: "actions",
        title: "Open project page",
        keywords: ["details", "git", "artifacts", "everything"],
        icon: PanelsTopLeft,
        run: () =>
          run(async () => {
            onModuleChange("reclaim");
            flow.setView("projects");
            flow.openProject(scope.path);
          }, true),
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
        run: () =>
          run(async () => {
            await action.perform();
            if (!action.leaves) setFlash(`${action.title} — done`);
          }, action.leaves),
      })),
      {
        id: "focus",
        group: "actions",
        title: "Show in workspace",
        keywords: ["find", "list", "map", "locate", "scroll"],
        icon: Compass,
        // Asking rather than navigating. Getting to the right screen is the easy
        // half; the list is the only thing that knows which filter is currently
        // hiding the row, so it is what answers the request.
        run: () =>
          run(async () => {
            onModuleChange("reclaim");
            flow.setView("projects");
            flow.closeProject();
            flow.focusProject(scope.path);
          }, true),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, actions]);

  const rootCommands = useMemo<Command[]>(() => {
    const items: Command[] = projects.map((project) => ({
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
      run: () => {
        setScope(project);
        setQuery("");
        setCursor(0);
      },
    }));

    items.push(
      {
        id: "go-workspace",
        group: "commands",
        title: "Go to Workspace",
        keywords: ["projects", "map", "reclaim"],
        icon: Compass,
        run: () => run(async () => onModuleChange("reclaim"), true),
      },
      {
        id: "go-insights",
        group: "commands",
        title: "Go to Insights",
        keywords: ["history", "report", "reclaimed"],
        icon: Compass,
        run: () => run(async () => onModuleChange("insights"), true),
      },
      {
        id: "go-maintenance",
        group: "commands",
        title: "Go to Maintenance",
        keywords: ["policy", "schedule", "automatic"],
        icon: Compass,
        run: () => run(async () => onModuleChange("intelligence"), true),
      },
      {
        id: "add-folder",
        group: "commands",
        title: "Add folder",
        keywords: ["root", "workspace", "choose", "scan"],
        icon: FolderPlus,
        run: () => run(async () => flow.pickRoot(), true),
      },
      {
        id: "rescan",
        group: "commands",
        title: "Scan workspace",
        keywords: ["refresh", "rescan", "read again"],
        icon: RefreshCw,
        run: () => run(async () => flow.startScan(), true),
      },
      {
        id: "settings",
        group: "commands",
        title: "Open settings",
        keywords: ["preferences", "ignore rules", "licence"],
        icon: Settings,
        run: () => run(async () => onOpenSettings(), true),
      },
    );

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, flow.footprints, flow.verdicts]);

  const results = useMemo(
    () => rankCommands(scope ? projectCommands : rootCommands, query) as Command[],
    [scope, projectCommands, rootCommands, query],
  );

  useEffect(() => {
    setCursor((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor, results.length]);

  if (!open) return null;

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((current) => (results.length === 0 ? 0 : (current + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((current) => (results.length === 0 ? 0 : (current - 1 + results.length) % results.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      void results[cursor]?.run();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (scope) back();
      else onClose();
    } else if (event.key === "Backspace" && query === "" && scope) {
      // Backspace out of an empty query is how every palette leaves a
      // sub-level, and it beats reaching for Escape mid-typing.
      event.preventDefault();
      back();
    }
  }

  function back() {
    setScope(null);
    setQuery("");
    setCursor(0);
    setFlash(null);
  }

  const grouped = groupCommands(results) as Array<{ id: string; items: Command[] }>;
  let index = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-6 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-forest-950/70"
      />

      <div className="relative flex max-h-[64vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-forest-800 bg-forest-900 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-forest-800 px-4">
          {scope ? (
            <button
              type="button"
              onClick={back}
              aria-label="Back to everything"
              className="shrink-0 rounded-md p-1 text-mist-500 transition-colors hover:text-mist-100"
            >
              <ArrowLeft size={15} aria-hidden="true" />
            </button>
          ) : (
            <Search size={15} className="shrink-0 text-mist-500" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={scope ? `${scope.name} — pick an action` : "Search projects and commands"}
            aria-label={scope ? `Actions for ${scope.name}` : "Search projects and commands"}
            className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-mist-100 outline-none placeholder:text-mist-500"
          />
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-2 [scrollbar-gutter:stable]">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-mist-500">
              {projects.length === 0 && !scope
                ? "Add a folder and your projects show up here."
                : "Nothing matches that."}
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.id} className="pb-1">
                <p className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
                  {GROUP_LABELS[group.id] ?? group.id}
                </p>
                {group.items.map((item) => {
                  index += 1;
                  const active = index === cursor;
                  const position = index;
                  return (
                    <Row
                      key={item.id}
                      item={item}
                      active={active}
                      onHover={() => setCursor(position)}
                      onSelect={() => void item.run()}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-forest-800 px-4 py-2 font-mono text-[10px] text-mist-500">
          <span className={flash ? "text-sage-300" : undefined}>
            {flash ?? (scope ? scope.path : `${projects.length} projects indexed`)}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <CornerDownLeft size={10} aria-hidden="true" /> select · esc {scope ? "back" : "close"}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({
  item,
  active,
  onHover,
  onSelect,
}: {
  item: Command;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}): ReactNode {
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-active={active}
      onMouseMove={onHover}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
        active ? "bg-forest-800" : ""
      }`}
    >
      <Icon size={14} className={active ? "shrink-0 text-sage-300" : "shrink-0 text-mist-500"} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-mist-100">{item.title}</span>
        {item.subtitle && (
          <span className="block truncate font-mono text-[10px] text-mist-500">{item.subtitle}</span>
        )}
      </span>
      {item.detail && <span className="shrink-0 font-mono text-[10px] text-mist-500">{item.detail}</span>}
    </button>
  );
}
