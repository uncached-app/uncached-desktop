import { ArrowLeft, CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PaletteRow } from "./palette/PaletteRow";
import { usePaletteCommands, type PaletteCommand } from "./palette/usePaletteCommands";
import { usePurgeFlow } from "../../hooks/usePurgeFlow";
import { groupCommands, rankCommands } from "../../utils/palette.mjs";
import type { AppModule } from "../../types/module";
import type { WorkspaceProject } from "../../types/workspace";

const GROUP_LABELS: Record<string, string> = {
  actions: "Actions",
  projects: "Projects",
  folders: "Folders",
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
 * What is offered lives in `usePaletteCommands`; how a list behaves under a
 * keyboard lives here. Neither has to be read to change the other.
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
  const { projectCommands, rootCommands } = usePaletteCommands({
    scope,
    onScope: (next) => {
      setScope(next);
      setQuery("");
      setCursor(0);
    },
    onModuleChange,
    onOpenSettings,
  });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setScope(project);
    setCursor(0);
    setFlash(null);
    inputRef.current?.focus();
  }, [open, project]);

  const results = useMemo(
    () => rankCommands(scope ? projectCommands : rootCommands, query) as PaletteCommand[],
    [scope, projectCommands, rootCommands, query],
  );

  useEffect(() => {
    setCursor((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor, results.length]);

  if (!open) return null;

  async function run(command: PaletteCommand) {
    try {
      await command.run();
      if (command.closes) onClose();
      // Something that finishes here says so. A copy with no evidence gets
      // pressed twice.
      // Selecting a project is the palette changing level, not a verb that
      // finished — the new list of actions is its own evidence. Everything
      // else that stays open has none, so it says so.
      else if (command.group !== "projects") setFlash(`${command.title} — done`);
    } catch (error) {
      // Said out loud rather than swallowed: a folder that moved since the scan
      // is the most likely failure here, and silence would read as a palette
      // that does nothing.
      setFlash(typeof error === "string" ? error : "That did not work");
    }
  }

  function back() {
    setScope(null);
    setQuery("");
    setCursor(0);
    setFlash(null);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((current) => (results.length === 0 ? 0 : (current + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((current) => (results.length === 0 ? 0 : (current - 1 + results.length) % results.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = results[cursor];
      if (command) void run(command);
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

  const grouped = groupCommands(results) as Array<{ id: string; items: PaletteCommand[] }>;
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
      {/* Over the backdrop rather than under it: a covered drag region is not
          one, and the titlebar is what this sits on top of. */}
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-12" />

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
            className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-mist-100 outline-none"
          />
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-2 scrollbar-gutter-stable">
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
                  const position = index;
                  return (
                    <PaletteRow
                      key={item.id}
                      item={item}
                      active={position === cursor}
                      onHover={() => setCursor(position)}
                      onSelect={() => void run(item)}
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
