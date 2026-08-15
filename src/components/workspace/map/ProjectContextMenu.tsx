import { PanelRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MenuRow } from "../../shared/MenuRow";
import { useProjectActions, withOneEditor } from "../../../hooks/useProjectActions";
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
 *
 * Verbs only — no headings, no descriptions, no right-hand column. Each of
 * those was carrying something the reader already had: which project (they
 * right-clicked it), what the project page holds, and the absolute path.
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
  // One editor, and no more. Choosing between them is what the palette is
  // for; here it would be a run of identical pencils.
  const actions = withOneEditor(useProjectActions(anchor.project));
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
      /* The palette's tokens, at a menu's size. Sized to its content rather
         than to a minimum: the width was being set by a right-hand column
         carrying absolute paths, which is a detail you cannot need about the
         row you just right-clicked. */
      className="fixed z-50 max-w-xs overflow-hidden rounded-2xl border border-forest-800 bg-forest-900 py-1.5 shadow-2xl"
    >
      <MenuRow
        icon={PanelRight}
        title="Open project page"
        onSelect={() => {
          onOpenProject(anchor.project.path);
          onClose();
        }}
      />

      {actions.map((action) => (
        <MenuRow
          key={action.id}
          icon={action.icon}
          title={action.title}
          onSelect={() => {
            onClose();
            void action.perform().then(
              () => onResult(action.leaves ? null : `${action.title.toLowerCase()} — done`),
              (error) => onResult(typeof error === "string" ? error : "That did not work"),
            );
          }}
        />
      ))}
    </div>
  );
}
