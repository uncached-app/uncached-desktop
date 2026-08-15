/**
 * Panning and zooming, as arithmetic.
 *
 * Kept out of the component because every one of these rules is the kind that
 * is wrong by a sign or an order of operations and looks almost right: a zoom
 * that drifts away from the pointer, a pan that lets the whole picture leave
 * the window with nothing to drag back.
 *
 * A view is `{ x, y, scale }`, applied as translate-then-scale. Coordinates are
 * the drawing's own, which is what the SVG `viewBox` establishes, so nothing
 * here knows about pixels or device ratios.
 */

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 8;

/** Untouched: the whole picture, laid out to fit. */
export const RESET = { x: 0, y: 0, scale: 1 };

/**
 * Zooms around a point, leaving whatever is under it exactly where it is.
 *
 * That fixed point is the whole feel of the gesture. Zooming around the centre
 * instead makes the thing you were looking at slide away as you approach it,
 * which reads as the picture fighting back.
 */
export function zoomAt(view, factor, point) {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  // The factor that survived clamping, which is not the one asked for at the
  // ends of the range — using the requested one there walks the picture
  // sideways every time the wheel is turned against a limit.
  const applied = scale / view.scale;

  return {
    scale,
    x: point.x - (point.x - view.x) * applied,
    y: point.y - (point.y - view.y) * applied,
  };
}

export function panBy(view, dx, dy) {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/**
 * Keeps a corner of the drawing reachable.
 *
 * Without this a firm swipe sends everything off the edge and leaves an empty
 * frame with no clue which way to drag — the picture is still there, and the
 * app looks broken. `keep` is how much of it must stay inside, in drawing
 * units.
 */
export function clampView(view, box, keep = 0.15) {
  const held = { x: box.width * keep, y: box.height * keep };
  const drawn = { width: box.width * view.scale, height: box.height * view.scale };

  return {
    scale: view.scale,
    x: clamp(view.x, held.x - drawn.width, box.width - held.x),
    y: clamp(view.y, held.y - drawn.height, box.height - held.y),
  };
}

/** Whether the view is anywhere other than where it started. */
export function isMoved(view) {
  return view.x !== 0 || view.y !== 0 || view.scale !== 1;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
