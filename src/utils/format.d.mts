/** Mirrors `format.mjs` so the module can be consumed from TypeScript. */

export declare function formatBytes(bytes: number): string;

export declare function formatAge(seconds: number | null | undefined, now?: number): string | null;

export declare function isOlderThan(
  seconds: number | null | undefined,
  days: number,
  now?: number,
): boolean;
