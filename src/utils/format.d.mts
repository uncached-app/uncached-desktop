/** Mirrors `format.mjs` so the module can be consumed from TypeScript. */

export declare function setFormatLocale(tag: string): void;

export declare function formatBytes(bytes: number, locale?: string): string;

export declare function formatAge(
  seconds: number | null | undefined,
  now?: number,
  locale?: string,
): string | null;

export declare function isOlderThan(
  seconds: number | null | undefined,
  days: number,
  now?: number,
): boolean;
