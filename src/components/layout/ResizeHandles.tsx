import { useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Direction =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

/** Where the OS border would be if the window were not inset by its gutter. */
const EDGES: { direction: Direction; className: string }[] = [
  { direction: "North", className: "inset-x-4 top-0 h-1.5 cursor-ns-resize" },
  { direction: "South", className: "inset-x-4 bottom-0 h-1.5 cursor-ns-resize" },
  { direction: "West", className: "inset-y-4 left-0 w-1.5 cursor-ew-resize" },
  { direction: "East", className: "inset-y-4 right-0 w-1.5 cursor-ew-resize" },
  { direction: "NorthWest", className: "left-0 top-0 size-4 cursor-nwse-resize" },
  { direction: "NorthEast", className: "right-0 top-0 size-4 cursor-nesw-resize" },
  { direction: "SouthWest", className: "left-0 bottom-0 size-4 cursor-nesw-resize" },
  { direction: "SouthEast", className: "right-0 bottom-0 size-4 cursor-nwse-resize" },
];

/**
 * The smallest the window may become, in logical pixels.
 *
 * The same two numbers as `minWidth` and `minHeight` in `tauri.conf.json`,
 * because the window manager will clamp the size to them whatever this asks
 * for — and a drag on the left edge sets the position from the width it
 * expects to get. Without the clamp here, pushing past the minimum moves a
 * window that then refuses to shrink, walking it across the screen.
 */
const MIN_WIDTH = 832;
const MIN_HEIGHT = 632;

type Drag = {
  direction: Direction;
  scale: number;
  /** The window's outer rectangle when the drag began, in physical pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where the pointer was on screen when it began, in CSS pixels. */
  pointerX: number;
  pointerY: number;
};

/**
 * The window's resize border, drawn where the window looks like it ends.
 *
 * The window is undecorated and 16px larger than the app on every side, so the
 * only edge the system offers to resize from is the outer rim of the shadow
 * gutter — transparent desktop, as far as the eye is concerned. These sit on
 * the app's own border instead.
 *
 * How they resize depends on the platform. Windows and Linux hand the drag to
 * the window manager, which is always better: it carries snapping, the live
 * outline and every gesture the desktop layers on a resize. macOS has no such
 * call — `start_resize_dragging` is `NotSupported` there, so it did nothing at
 * all — and the drag is run here instead, from pointer positions in screen
 * coordinates, with one command placing the frame.
 *
 * Hidden while the window fills the screen: the gutter closes with it, the
 * system edge and the visible edge become the same line, and a strip that
 * swallowed clicks along it would be taking them from the app for nothing.
 */
export function ResizeHandles() {
  const drag = useRef<Drag | null>(null);
  // The latest rectangle asked for, and whether one is already on its way.
  //
  // Pointer moves arrive faster than the window is placed. Sending each would
  // queue rectangles that are stale before they land; dropping the ones that
  // arrive while a call is in flight would drop the last one too, leaving the
  // window a frame behind wherever the pointer stopped. So the newest is kept
  // and sent as soon as the line is free.
  const pending = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const placing = useRef(false);
  const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);

  if (!isTauri()) return null;

  function place() {
    if (placing.current) return;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    placing.current = true;
    void invoke("set_window_frame", next).finally(() => {
      placing.current = false;
      place();
    });
  }

  function begin(event: React.PointerEvent<HTMLDivElement>, direction: Direction) {
    if (event.button !== 0) return;
    event.preventDefault();
    const appWindow = getCurrentWindow();

    if (!isMac) {
      void appWindow.startResizeDragging(direction);
      return;
    }

    // Both read before the first await: a synthetic event's `currentTarget` is
    // cleared once the handler returns, and the pointer has not moved yet.
    const handle = event.currentTarget;
    const { pointerId, screenX, screenY } = event;
    // Captured now, so the rest of the drag is delivered here even once the
    // pointer has left the handle — which it does immediately, because the edge
    // it is dragging moves out from under it.
    handle.setPointerCapture(pointerId);

    void Promise.all([
      appWindow.scaleFactor(),
      appWindow.outerPosition(),
      appWindow.outerSize(),
    ]).then(([scale, position, size]) => {
      drag.current = {
        direction,
        scale,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        pointerX: screenX,
        pointerY: screenY,
      };
    });
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    const { direction, scale } = start;
    const dx = (event.screenX - start.pointerX) * scale;
    const dy = (event.screenY - start.pointerY) * scale;

    let width = start.width;
    let height = start.height;
    if (direction.includes("East")) width = start.width + dx;
    if (direction.includes("West")) width = start.width - dx;
    if (direction.includes("South")) height = start.height + dy;
    if (direction.includes("North")) height = start.height - dy;
    width = Math.round(Math.max(MIN_WIDTH * scale, width));
    height = Math.round(Math.max(MIN_HEIGHT * scale, height));

    // Derived from the size that will actually be applied, not from the
    // pointer: at the minimum the edge under the pointer has stopped moving,
    // and a position that kept following it would drag the whole window along.
    const x = direction.includes("West") ? Math.round(start.x + (start.width - width)) : start.x;
    const y = direction.includes("North") ? Math.round(start.y + (start.height - height)) : start.y;

    pending.current = { x, y, width, height };
    place();
  }

  function end(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <>
      {EDGES.map(({ direction, className }) => (
        <div
          key={direction}
          aria-hidden="true"
          data-tauri-drag-region="false"
          onPointerDown={(event) => void begin(event, direction)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className={`absolute z-50 touch-none root-filled:hidden ${className}`}
        />
      ))}
    </>
  );
}
