import { categoryPresentation } from "../../components/findings/TargetCard";
import type { Dimension, Report } from "../../utils/report.d.mts";

export const DIMENSION_LABELS: Record<Dimension, string> = {
  category: "Artifact",
  workspace: "Workspace",
  trigger: "Started by",
  mode: "Removed to",
};

/** The value written when the event predates the dimension it is missing. */
export const UNRECORDED = "Unrecorded";

/** How many cleanups the log shows before it stops being a list. */
export const EVENT_PAGE = 40;

/** A dimension value, in the words the rest of the app already uses. */
export function labelFor(dimension: Dimension, key: string | null): string {
  if (key === null) return UNRECORDED;
  if (dimension === "category") return categoryPresentation(key).label;
  if (dimension === "workspace") {
    const segments = key.split("/").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : key;
  }
  if (dimension === "mode") return key === "Trash" ? "Recycle Bin" : "Permanently";
  return key === "Scheduled" ? "A schedule" : "You";
}

/**
 * Names a bucket at the grain it was measured at.
 *
 * A month bucket labelled "1 Aug" reads as a day, and two of them a year apart
 * read as the same bucket — which is exactly how an axis stops meaning anything.
 */
export function formatBucket(iso: string, bucket: Report["bucket"]): string {
  const date = new Date(iso);
  if (bucket === "month") return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
