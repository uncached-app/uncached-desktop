/** The last segment of a folder path, which is what people call it. */
export function rootName(path: string): string {
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/** `⌘` where it means something, `Ctrl` where it does not. */
export function commandKeyLabel(): string {
  return /Macintosh|Mac OS X/.test(navigator.userAgent) ? "⌘" : "Ctrl ";
}
