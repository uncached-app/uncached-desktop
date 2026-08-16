import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { placeMenu } from "../../utils/menuPlacement.mjs";

/** Where the pointer was, in viewport coordinates. */
export type MenuPoint = { x: number; y: number };

/**
 * A menu at the pointer, staying on screen and closing when it stops meaning
 * anything.
 *
 * The shell only — what is in it is the caller's. It was written for the
 * project menu and extracted when the folder menu needed the same four
 * behaviours; a second copy of them would have been a second place for a menu
 * to start hanging off the bottom of the window.
 */
export function ContextMenu({
  at,
  label,
  onClose,
  children,
}: {
  at: MenuPoint;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(() => measure(at, 0, 0));

  // Placed from its measured size, and placed again whenever that size
  // changes. The size changes on its own: the editor row appears once the
  // machine has been asked what it has installed, so a menu that fit when it
  // was drawn grows a row afterwards, downward, off the bottom of the window.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const place = () => {
      const { width, height } = menu.getBoundingClientRect();
      setBox(measure(at, width, height));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    return () => observer.disconnect();
  }, [at]);

  useEffect(() => {
    function dismiss(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    // Any scroll moves what this was anchored to, so the menu stops describing
    // anything — except the menu's own, which happens when it is taller than
    // the window and is the reader moving through it.
    function onScroll(event: Event) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    // `capture` so a click that also lands on a row closes this first rather
    // than opening whatever is underneath the menu.
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
      aria-label={label}
      style={{ left: box.left, top: box.top, maxHeight: box.maxHeight }}
      /* The palette's tokens, at a menu's size. Sized to its content rather
         than to a minimum: the width was being set by a right-hand column
         carrying absolute paths, which is a detail you cannot need about the
         row you just right-clicked. */
      className="fixed z-50 max-w-xs overflow-y-auto overscroll-contain rounded-2xl border border-forest-800 bg-forest-900 py-1.5 shadow-2xl"
    >
      {children}
    </div>
  );
}

function measure(at: MenuPoint, width: number, height: number) {
  return placeMenu({
    x: at.x,
    y: at.y,
    width,
    height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
}
