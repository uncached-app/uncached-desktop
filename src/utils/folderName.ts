/**
 * The last segment of a path, or the path when it has no usable one.
 *
 * Both separators, because a path here comes from the native side and Windows
 * hands back backslashes. Trailing separators are dropped rather than yielding
 * an empty name.
 */
export function folderName(path: string): string {
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}
