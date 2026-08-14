// Which artifacts belong to which project.
//
// The scan finds targets by absolute path and the index finds projects by
// absolute path; pairing them is a string question with one trap in it, and the
// trap is that `/work-archive` starts with `/work`. Separator-aware rather than
// naive, for the same reason the native side compares paths component-wise.

const TRAILING = /[\\/]+$/;

/** Whether `child` is `parent` or sits underneath it. */
export function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string") return false;
  const root = parent.replace(TRAILING, "");
  if (!root) return false;
  return child === root || child.startsWith(`${root}/`) || child.startsWith(`${root}\\`);
}

/** The last segment of a path, whatever separator it was written with. */
export function baseName(path) {
  if (typeof path !== "string") return "";
  const segments = path.replace(TRAILING, "").split(/[\\/]/);
  return segments[segments.length - 1] ?? path;
}

/** What `child` is called relative to `parent`, or the whole path if unrelated. */
export function relativeTo(child, parent) {
  if (!isInside(child, parent)) return child;
  const root = parent.replace(TRAILING, "");
  return child.slice(root.length + 1) || baseName(child);
}
