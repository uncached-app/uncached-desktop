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

/**
 * Low enough to see a whole workspace at once.
 *
 * The drawing is not fitted to the window — a large one extends well past it —
 * so this is what decides whether "the whole thing" is a view that exists.
 */
export const MIN_SCALE = 0.08;
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
 * Keeps some of the drawing reachable, and all of it reachable.
 *
 * Two failures, one rule. Without a limit a firm swipe sends everything off the
 * edge and leaves an empty frame with no clue which way to drag. With a limit
 * measured against the window instead of against the drawing, a workspace
 * larger than the window cannot be panned to its own edges — the far side is
 * there and unreachable, which is the worse of the two because it looks like
 * the map simply stops.
 *
 * `content` is what was actually drawn, in drawing units. `keep` is how much of
 * it must stay inside the frame.
 */
export function clampView(view, box, content, keep = 0.2) {
  const drawn = content ?? { x: 0, y: 0, width: box.width, height: box.height };
  const held = { x: box.width * keep, y: box.height * keep };

  return {
    scale: view.scale,
    x: clamp(
      view.x,
      held.x - (drawn.x + drawn.width) * view.scale,
      box.width - held.x - drawn.x * view.scale,
    ),
    y: clamp(
      view.y,
      held.y - (drawn.y + drawn.height) * view.scale,
      box.height - held.y - drawn.y * view.scale,
    ),
  };
}

/**
 * The view that shows all of it.
 *
 * What the fit control does, and what "the whole workspace" means once the
 * drawing stopped being squeezed into the frame to begin with.
 */
export function fitTo(content, box, padding = 0.03) {
  if (!content || content.width <= 0 || content.height <= 0) return RESET;
  const scale = clamp(
    Math.min(box.width / content.width, box.height / content.height) * (1 - padding),
    MIN_SCALE,
    MAX_SCALE,
  );

  return {
    scale,
    x: box.width / 2 - (content.x + content.width / 2) * scale,
    y: box.height / 2 - (content.y + content.height / 2) * scale,
  };
}

/** Whether the view is anywhere other than where it started. */
export function isMoved(view) {
  return view.x !== 0 || view.y !== 0 || view.scale !== 1;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
