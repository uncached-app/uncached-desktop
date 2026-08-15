import { PanelRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MenuRow } from "../../shared/MenuRow";
import { useProjectActions, withOneEditor } from "../../../hooks/useProjectActions";
import { placeMenu } from "../../../utils/menuPlacement.mjs";
import type { WorkspaceProject } from "../../../types/workspace";

/** Where the pointer was, in viewport coordinates. */
export type MenuAnchor = { project: WorkspaceProject; x: number; y: number };

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
  const [box, setBox] = useState(() => measure(anchor, 0, 0));

  // Placed from its measured size, and placed again whenever that size
  // changes. The size changes on its own: the editor row appears once the
  // machine has been asked what it has installed, so a menu that fit when it
  // was drawn grows a row afterwards, downward, off the bottom of the window.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const place = () => {
      const { width, height } = menu.getBoundingClientRect();
      setBox(measure(anchor, width, height));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    return () => observer.disconnect();
  }, [anchor]);

  useEffect(() => {
    function dismiss(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    // Any scroll moves the row this was anchored to, so the menu stops
    // describing anything — except the menu's own, which happens when it is
    // taller than the window and is the reader moving through it.
    function onScroll(event: Event) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    // `capture` so a click that also lands on a row closes this first rather
    // than opening that project underneath the menu.
    window.addEventListener("mousedown", dismiss, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", dismiss, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${anchor.project.name} actions`}
      style={{ left: box.left, top: box.top, maxHeight: box.maxHeight }}
      /* The palette's tokens, at a menu's size. Sized to its content rather
         than to a minimum: the width was being set by a right-hand column
         carrying absolute paths, which is a detail you cannot need about the
         row you just right-clicked. */
      className="fixed z-50 max-w-xs overflow-y-auto overscroll-contain rounded-2xl border border-forest-800 bg-forest-900 py-1.5 shadow-2xl"
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

function measure(anchor: MenuAnchor, width: number, height: number) {
  return placeMenu({
    x: anchor.x,
    y: anchor.y,
    width,
    height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
}
