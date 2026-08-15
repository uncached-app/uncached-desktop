import { ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useProjectActions } from "../../../hooks/useProjectActions";
import type { WorkspaceProject } from "../../../types/workspace";

/** Where the pointer was, in viewport coordinates. */
export type MenuAnchor = { project: WorkspaceProject; x: number; y: number };

const MARGIN = 8;

/**
 * The project's verbs, at the pointer.
 *
 * Reads `useProjectActions`, which is also what the palette and the project
 * page read, so the three can never offer different things — the reason that
 * hook exists at all.
 *
 * Every entry leaves the app or copies something. Nothing here reclaims: a
 * destructive action one right-click and one small target away from a row is
 * how a workspace loses a project nobody meant to touch. Opening the page,
 * which is where reclaiming lives, is the first entry instead.
 */
export function ProjectContextMenu({
  anchor,
  onOpenProject,
  onResult,
  onClose,
}: {
  anchor: MenuAnchor;
  onOpenProject: (path: string) => void;
  onResult: (message: string | null) => void;
  onClose: () => void;
}) {
  const actions = useProjectActions(anchor.project);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y });

  // Measured, then nudged back inside. A menu opened near the bottom-right of
  // the window would otherwise render most of itself off-screen, and the one
  // place a right-click is most likely is the last row in a long list.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.min(anchor.x, window.innerWidth - width - MARGIN),
      top: Math.min(anchor.y, window.innerHeight - height - MARGIN),
    });
  }, [anchor]);

  useEffect(() => {
    function dismiss(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    // `capture` so a click that also lands on a row closes this first rather
    // than opening that project underneath the menu.
    window.addEventListener("mousedown", dismiss, true);
    window.addEventListener("keydown", onKey);
    // Any scroll moves the row this was anchored to, so the menu stops
    // describing anything.
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", dismiss, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${anchor.project.name} actions`}
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 min-w-56 overflow-hidden rounded-xl border border-forest-800 bg-forest-900 py-1 shadow-2xl"
    >
      <p className="truncate px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-mist-500">
        {anchor.project.name}
      </p>

      <MenuItem
        label="Open project page"
        onSelect={() => {
          onOpenProject(anchor.project.path);
          onClose();
        }}
      >
        <ChevronRight size={13} className="text-mist-500" aria-hidden="true" />
      </MenuItem>

      <div className="my-1 h-px bg-forest-800" aria-hidden="true" />

      {actions.map((action) => (
        <MenuItem
          key={action.id}
          label={action.title}
          detail={action.detail}
          onSelect={() => {
            onClose();
            void action.perform().then(
              () => onResult(action.leaves ? null : `${action.title.toLowerCase()} — done`),
              (error) => onResult(typeof error === "string" ? error : "That did not work"),
            );
          }}
        >
          <action.icon size={13} className="text-mist-500" aria-hidden="true" />
        </MenuItem>
      ))}
    </div>
  );
}

function MenuItem({
  label,
  detail,
  children,
  onSelect,
}: {
  label: string;
  detail?: string;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-mist-300 transition-colors hover:bg-forest-850 hover:text-mist-100"
    >
      <span className="grid size-4 shrink-0 place-items-center">{children}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail && (
        <span className="max-w-28 shrink-0 truncate font-mono text-[10px] text-mist-500">
          {detail}
        </span>
      )}
    </button>
  );
}
