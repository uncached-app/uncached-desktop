import type { TFunction } from "i18next";
import { translatedCategoryPresentation } from "../../components/findings/categoryPresentation";
import type { Dimension, Report } from "../../utils/report.d.mts";

const DIMENSION_LABEL_KEYS = {
  category: "insights.dimensions.category",
  workspace: "insights.dimensions.workspace",
  trigger: "insights.dimensions.trigger",
  mode: "insights.dimensions.mode",
} as const satisfies Record<Dimension, string>;

export function dimensionLabel(t: TFunction, dimension: Dimension): string {
  return t(DIMENSION_LABEL_KEYS[dimension]);
}

/** How many cleanups the log shows before it stops being a list. */
export const EVENT_PAGE = 10;

/** A dimension value, in the words the rest of the app already uses. */
export function labelFor(t: TFunction, dimension: Dimension, key: string | null): string {
  if (key === null) return t("insights.values.unrecorded");
  if (dimension === "category") return translatedCategoryPresentation(key, t).label;
  if (dimension === "workspace") {
    const segments = key.split("/").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : key;
  }
  if (dimension === "mode") {
    return key === "Trash" ? t("insights.values.trash") : t("insights.values.permanent");
  }
  return key === "Scheduled" ? t("insights.values.scheduled") : t("insights.values.manual");
}

/**
 * Names a bucket at the grain it was measured at.
 *
 * A month bucket labelled "1 Aug" reads as a day, and two of them a year apart
 * read as the same bucket — which is exactly how an axis stops meaning anything.
 */
export function formatBucket(iso: string, bucket: Report["bucket"], locale: string): string {
  const date = new Date(iso);
  if (bucket === "month") return date.toLocaleDateString(locale, { month: "short", year: "numeric" });
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function formatMoment(iso: string, locale: string): string {
  const date = new Date(iso);
  const dayMonth = date.toLocaleDateString(locale, { month: "short", day: "numeric" }).replace(/\.$/, "");
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${dayMonth} · ${time}`;
}
