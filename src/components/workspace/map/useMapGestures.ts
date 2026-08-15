import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RESET, clampView, fitTo, isMoved, panBy, zoomAt, type Rect, type View } from "../../../utils/viewport.mjs";

/** Past this much movement a press was a drag, and never a click on a node. */
const DRAG_SLOP = 4;

/** One wheel notch. Small enough that a mouse wheel is not a jump cut. */
const WHEEL_ZOOM = 0.0022;

/**
 * Drag to move, pinch or wheel to zoom.
 *
 * The gesture split is the platform's, not an invention: a trackpad sends a
 * pinch as a wheel event with `ctrlKey` set, and two fingers scrolling as one
 * without it. So `ctrlKey` means zoom and everything else means pan, which is
 * what every map and canvas on this machine already does — and a mouse wheel,
 * which has no pinch, is read as zoom because on a mouse that is the only thing
 * a wheel over a picture can usefully mean.
 *
 * Coordinates are the drawing's own. A pointer arrives in pixels and is
 * converted through the element's box, because the SVG scales to fit and the
 * two stop being the same number the moment the window is not the right shape.
 */
export function useMapGestures(width: number, height: number, content: Rect) {
  // Built here rather than taken as an object: a fresh `{width, height}` each
  // render would tear down and re-attach the wheel listener on every one.
  const box = useMemo(() => ({ width, height }), [width, height]);
  // What was drawn, which is larger than the box as soon as the workspace is.
  // Panning is limited against this and not against the window, or the far side
  // of a large map is there and unreachable.
  const drawn = useMemo(
    () => ({ x: content.x, y: content.y, width: content.width, height: content.height }),
    [content.x, content.y, content.width, content.height],
  );
  const ref = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(RESET);
  const [dragging, setDragging] = useState(false);
  // Whether the press that is happening now has already moved far enough to be
  // a drag. Held in a ref because the click handler reads it during the same
  // event, before any render could have carried it.
  const moved = useRef(false);
  const from = useRef<{ x: number; y: number } | null>(null);
  // Where the pointer was last seen. `movementX` would be the obvious source
  // and is not dependable under pointer capture in this webview, which shows up
  // as a drag that does nothing at all.
  const last = useRef<{ x: number; y: number } | null>(null);

  const toDrawing = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const element = ref.current;
      if (!element) return { x: 0, y: 0 };
      const bounds = element.getBoundingClientRect();
      // `xMidYMid meet`: one scale for both axes, and the leftover is split.
      const scale = Math.min(bounds.width / box.width, bounds.height / box.height);
      const left = bounds.left + (bounds.width - box.width * scale) / 2;
      const top = bounds.top + (bounds.height - box.height * scale) / 2;
      return { x: (event.clientX - left) / scale, y: (event.clientY - top) / scale };
    },
    [box.width, box.height],
  );

  // Attached by hand rather than as a prop: React's wheel handler is passive,
  // and a passive listener cannot stop the page from scrolling underneath.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM * 4);
        setView((current) => clampView(zoomAt(current, factor, toDrawing(event)), box, drawn));
        return;
      }
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        setView((current) => clampView(panBy(current, -event.deltaX, -event.deltaY), box, drawn));
        return;
      }
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM);
      setView((current) => clampView(zoomAt(current, factor, toDrawing(event)), box, drawn));
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [box, drawn, toDrawing]);

  const wasDragged = useCallback(() => moved.current, []);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    from.current = { x: event.clientX, y: event.clientY };
    last.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
    setDragging(true);
  };

  // Followed on the window rather than by capturing the pointer. Capture is the
  // obvious tool and the wrong one here: a captured pointer sends its `click` to
  // the element that captured it, so every press on a node would open nothing
  // and the map would be a picture you can only look at.
  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      const start = from.current;
      const element = ref.current;
      if (!start || !element) return;

      if (!moved.current && Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_SLOP) {
        return;
      }
      moved.current = true;

      const previous = last.current ?? start;
      last.current = { x: event.clientX, y: event.clientY };

      const bounds = element.getBoundingClientRect();
      const scale = Math.min(bounds.width / box.width, bounds.height / box.height);
      setView((current) =>
        clampView(
          panBy(current, (event.clientX - previous.x) / scale, (event.clientY - previous.y) / scale),
          box,
          drawn,
        ),
      );
    };

    const onUp = () => {
      from.current = null;
      last.current = null;
      setDragging(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, box, drawn]);

  return {
    ref,
    view,
    dragging,
    /** The buttons' way in, so they and the wheel share one rule. */
    zoomBy: (factor: number, at: { clientX: number; clientY: number }) =>
      setView((current) => clampView(zoomAt(current, factor, toDrawing(at)), box, drawn)),
    moved: isMoved(view),
    /** The drawing reaches past the frame, so there is something to fit to. */
    overflows: drawn.width > box.width + 1 || drawn.height > box.height + 1,
    /** The whole drawing, which is not the same as an untouched view. */
    fit: () => setView(fitTo(drawn, box)),
    reset: () => setView(RESET),
    /** True when the press that just ended was a drag, so it opened nothing.
        Stable, because the memoised drawing takes it as a prop. */
    wasDragged,
    handlers: { onPointerDown },
  };
}
