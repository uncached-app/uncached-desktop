/** Mirrors `palette.mjs` so the palette can be consumed from TypeScript. */

export type PaletteItem = {
  id: string;
  /** Which section it is drawn under. */
  group: string;
  title: string;
  subtitle?: string;
  /** Words worth finding it by that are not on screen. */
  keywords?: string[];
};

export function scoreCommand(item: PaletteItem, query: string): number | null;
export function rankCommands<T extends PaletteItem>(items: T[], query: string): T[];
export function groupCommands<T extends PaletteItem>(items: T[]): Array<{ id: string; items: T[] }>;
