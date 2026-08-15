/** Mirrors `viewport.mjs` so the module can be consumed from TypeScript. */

export type View = { x: number; y: number; scale: number };

export declare const MIN_SCALE: number;
export declare const MAX_SCALE: number;
export declare const RESET: View;

export declare function zoomAt(view: View, factor: number, point: { x: number; y: number }): View;
export declare function panBy(view: View, dx: number, dy: number): View;
export declare function clampView(
  view: View,
  box: { width: number; height: number },
  keep?: number,
): View;
export declare function isMoved(view: View): boolean;
