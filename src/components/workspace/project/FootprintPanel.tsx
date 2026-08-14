import { PieChart } from "lucide-react";
import { categoryPresentation } from "../../findings/categoryPresentation";
import { formatBytes } from "../../../utils/format";
import type { Footprint } from "../../../types/workspace";

/**
 * Below this a segment is thinner than a hairline and its row is noise.
 *
 * The bytes are not dropped — everything under it is summed into one trailing
 * segment, so the bar still adds up to the project. A chart whose parts do not
 * total the number printed above it is worse than no chart.
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

/**
 * Where a project's reclaimable weight actually went.
 *
 * `byCategory` has been computed and sorted heaviest-first in Rust since the
 * footprint existed, and nothing read it — the interface could say a project
 * held 6 GB of cache and not which cache, which is the first question anyone
 * asks and the one a file manager cannot answer.
 *
 * It covers the reclaimable side only. Source code is one figure in the header
 * because there is nothing to break it into that this product has an opinion
 * about.
 */
export function FootprintPanel({ footprint }: { footprint: Footprint }) {
  const total = footprint.byCategory.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total === 0) return null;

  const large = footprint.byCategory.filter((entry) => entry.bytes / total >= MIN_SHARE);
  const remainder = total - large.reduce((sum, entry) => sum + entry.bytes, 0);

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-forest-800 pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-mist-100">
          <PieChart size={14} className="text-mist-500" aria-hidden="true" />
          Where the space went
        </h2>
        <span className="font-mono text-xs text-mist-500">
          {footprint.hasErrors && <span className="mr-0.5">&ge;</span>}
          {formatBytes(total)} across {footprint.byCategory.length}{" "}
          {footprint.byCategory.length === 1 ? "kind" : "kinds"}
        </span>
      </div>

      <div
        className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-forest-950"
        role="img"
        aria-label={`Reclaimable weight by artifact: ${large
          .map((entry) => `${categoryPresentation(entry.category).label} ${formatBytes(entry.bytes)}`)
          .join(", ")}`}
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

      <ul className="mt-4 grid gap-2">
        {large.map((entry, rank) => {
          const { label, icon: Icon } = categoryPresentation(entry.category);
          return (
            <li key={entry.category} className="flex items-center gap-2.5 text-xs">
              <span
                className={`size-2 shrink-0 rounded-full ${SEGMENT_COLOURS[rank % SEGMENT_COLOURS.length]}`}
                aria-hidden="true"
              />
              <Icon size={13} className="shrink-0 text-mist-500" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-mist-300">{label}</span>
              <span className="shrink-0 font-mono text-[11px] text-mist-500">
                {Math.round((entry.bytes / total) * 100)}%
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
            <span className="min-w-0 flex-1 truncate pl-[21px] text-mist-500">
              {footprint.byCategory.length - large.length} smaller{" "}
              {footprint.byCategory.length - large.length === 1 ? "kind" : "kinds"}
            </span>
            <span className="shrink-0 font-mono text-xs text-mist-500">{formatBytes(remainder)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
