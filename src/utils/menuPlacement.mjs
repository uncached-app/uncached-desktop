/** Distance a floating menu keeps from the window edge. */
export const MENU_MARGIN = 8;

/**
 * Where a menu of a measured size goes, given where the pointer was.
 *
 * Preferred side first, then the opposite side of the pointer, then flat
 * against the edge. Flipping rather than sliding is what a native context menu
 * does, and it is the difference between a menu that opens beside the cursor
 * and one that opens underneath it.
 *
 * The returned height is a ceiling, not a size: a menu with more entries than
 * the window is tall scrolls inside itself. Cutting it off instead hides
 * entries while looking exactly like a menu that does not have them.
 */
export function placeMenu({ x, y, width, height, viewportWidth, viewportHeight, margin = MENU_MARGIN }) {
  return {
    left: fit(x, width, viewportWidth, margin),
    top: fit(y, height, viewportHeight, margin),
    maxHeight: Math.max(0, viewportHeight - margin * 2),
  };
}

/**
 * Where a panel attached to a control goes: under it, or over it.
 *
 * Different rule from `placeMenu` because the anchor is a rectangle rather
 * than a point, and the panel must never cover it — the control is what the
 * panel is about, and a dropdown sitting on top of its own trigger reads as a
 * misdrawn layer. When neither side has room for the whole list, the roomier
 * side wins and the list scrolls.
 */
export function placeUnder({ anchor, width, height, viewportWidth, viewportHeight, margin = MENU_MARGIN, gap = 4 }) {
  const below = Math.max(0, viewportHeight - anchor.bottom - gap - margin);
  const above = Math.max(0, anchor.top - gap - margin);
  const under = height <= below || below >= above;
  const maxHeight = under ? below : above;

  return {
    left: fit(anchor.left, width, viewportWidth, margin),
    top: under ? anchor.bottom + gap : anchor.top - gap - Math.min(height, maxHeight),
    maxHeight,
  };
}

function fit(start, size, extent, margin) {
  if (start + size + margin <= extent) return start;
  if (start - size >= margin) return start - size;
  return Math.max(margin, extent - size - margin);
}
