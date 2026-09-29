import { useTranslation } from "react-i18next";
import { translatedCategoryPresentation } from "./findings/categoryPresentation";
import { formatBytes } from "../utils/format.mjs";
import type { CategoryBytes } from "../types/workspace";

/**
 * Below this a segment is thinner than a hairline and its row is noise.
 *
 * The bytes are not dropped — everything under it is summed into one trailing
 * segment, so the bar still adds up to the figure printed above it. A chart
 * whose parts do not total its own header is worse than no chart.
 */
const MIN_SHARE = 0.02;

/** A colour per rank, not per category: the ordering is what carries meaning. */
const SEGMENT_COLOURS = [
  "bg-sage-400",
  "bg-sage-300/70",
  "bg-pro-200/70",
  "bg-mist-500/60",
  "bg-mist-500/40",
];

const REMAINDER_COLOUR = "bg-forest-700";

/** What the bar is made of, once the tail has been folded together. */
export function splitCategories(entries: CategoryBytes[]) {
  const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total === 0) return { total: 0, large: [], remainder: 0, hidden: 0 };

  const large = entries.filter((entry) => entry.bytes / total >= MIN_SHARE);
  const remainder = total - large.reduce((sum, entry) => sum + entry.bytes, 0);
  return { total, large, remainder, hidden: entries.length - large.length };
}

/**
 * One proportional bar over a set of artifact kinds.
 *
 * Shared by a project's own page and by the workspace portrait: the two answer
 * the same question at different scales, and two drawings of one idea drift.
 */
export function CategoryBar({
  entries,
  label,
  height = "h-2.5",
}: {
  entries: CategoryBytes[];
  /** Read out to anyone who cannot see the bar. */
  label: string;
  height?: string;
}) {
  const { t } = useTranslation();
  const { total, large, remainder } = splitCategories(entries);
  if (total === 0) return null;

  return (
    <div
      className={`flex ${height} w-full overflow-hidden rounded-full bg-forest-950`}
      role="img"
      aria-label={t("findings.categoryBar.summary", {
        label,
        segments: large
          .map((entry) =>
            t("findings.categoryBar.segment", {
              category: translatedCategoryPresentation(entry.category, t).label,
              size: formatBytes(entry.bytes),
            }),
          )
          .join(", "),
      })}
    >
      {large.map((entry, rank) => (
        <div
          key={entry.category}
          className={`h-full ${SEGMENT_COLOURS[rank % SEGMENT_COLOURS.length]}`}
          style={{ width: `${(entry.bytes / total) * 100}%` }}
        />
      ))}
      {remainder > 0 && (
        <div className={`h-full ${REMAINDER_COLOUR}`} style={{ width: `${(remainder / total) * 100}%` }} />
      )}
    </div>
  );
}

/** The legend beneath a `CategoryBar`, in the same order and the same colours. */
export function CategoryLegend({ entries }: { entries: CategoryBytes[] }) {
  const { t, i18n } = useTranslation();
  const { total, large, remainder, hidden } = splitCategories(entries);
  if (total === 0) return null;
  const percent = new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: 0 });

  return (
    <ul className="grid gap-2">
      {large.map((entry, rank) => {
        const { label, icon: Icon } = translatedCategoryPresentation(entry.category, t);
        return (
          <li key={entry.category} className="flex items-center gap-2.5 text-xs">
            <span
              className={`size-2 shrink-0 rounded-full ${SEGMENT_COLOURS[rank % SEGMENT_COLOURS.length]}`}
              aria-hidden="true"
            />
            <Icon size={13} className="shrink-0 text-mist-500" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-mist-300">{label}</span>
            <span className="shrink-0 font-mono text-[11px] text-mist-500">
              {percent.format(Math.round((entry.bytes / total) * 100) / 100)}
            </span>
            <span className="shrink-0 font-mono text-xs font-semibold text-mist-100">
              {formatBytes(entry.bytes)}
            </span>
          </li>
        );
      })}
      {remainder > 0 && (
        <li className="flex items-center gap-2.5 text-xs">
          <span className={`size-2 shrink-0 rounded-full ${REMAINDER_COLOUR}`} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate ps-[21px] text-mist-500">
            {t("findings.categoryBar.smallerKinds", { count: hidden })}
          </span>
          <span className="shrink-0 font-mono text-xs text-mist-500">{formatBytes(remainder)}</span>
        </li>
      )}
    </ul>
  );
}
