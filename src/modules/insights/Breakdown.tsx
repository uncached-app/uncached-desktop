import { DIMENSION_LABELS, UNRECORDED, labelFor } from "./labels";
import { formatBytes } from "../../utils/format";
import type { BreakdownRow, Dimension } from "../../utils/report.d.mts";

/** One dimension, ranked, and clickable because a rank you cannot follow is a caption. */
export function Breakdown({
  dimension,
  rows,
  selected,
  onSelect,
}: {
  dimension: Dimension;
  rows: BreakdownRow[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
        {DIMENSION_LABELS[dimension]}
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-mist-500">Nothing in this window.</p>
      ) : (
        <ul className="mt-3 grid gap-1.5">
          {rows.slice(0, 6).map((row) => (
            <li key={row.key ?? UNRECORDED}>
              <button
                type="button"
                onClick={() => onSelect(row.key)}
                className={`group relative w-full overflow-hidden rounded-lg px-2.5 py-2 text-left transition-colors ${
                  selected === row.key ? "bg-forest-800" : "hover:bg-forest-850"
                }`}
              >
                {/* The bar is the row's own background rather than a separate
                    column: the share is the shape of the line you are reading. */}
                <span
                  className="absolute inset-y-0 left-0 bg-sage-400/12"
                  style={{ width: `${Math.round(row.share * 100)}%` }}
                  aria-hidden="true"
                />
                <span className="relative flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-mist-100">{labelFor(dimension, row.key)}</span>
                  <span className="shrink-0 font-mono text-xs text-mist-300">{formatBytes(row.bytes)}</span>
                </span>
                <span className="relative mt-0.5 block font-mono text-[10px] text-mist-500">
                  {row.cleanups} {row.cleanups === 1 ? "cleanup" : "cleanups"} · {Math.round(row.share * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
