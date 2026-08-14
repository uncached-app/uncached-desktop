/** Mirrors `paths.mjs`. Separator-aware, because `/work-archive` starts with `/work`. */
export function isInside(child: string, parent: string): boolean;
export function baseName(path: string): string;
export function relativeTo(child: string, parent: string): string;
