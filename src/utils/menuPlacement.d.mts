/** Mirrors `menuPlacement.mjs` so the module can be consumed from TypeScript. */

export declare const MENU_MARGIN: number;

export type MenuBox = {
  left: number;
  top: number;
  /** A ceiling. Past it the menu scrolls rather than being cut off. */
  maxHeight: number;
};

export declare function placeMenu(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
}): MenuBox;
