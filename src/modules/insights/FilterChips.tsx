import { Filter, X } from "lucide-react";
import { DIMENSION_LABELS, labelFor } from "./labels";
import { DIMENSIONS } from "../../utils/report.mjs";
import type { Dimension, Filters } from "../../utils/report.d.mts";

/** What the report is currently narrowed to, and the only way to widen it back. */
export function FilterChips({
  filters,
  onClear,
}: {
  filters: Filters;
  onClear: (dimension: Dimension) => void;
}) {
  const active = (DIMENSIONS as Dimension[]).filter((dimension) => filters[dimension] != null);
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-forest-800 bg-forest-900 px-4 py-2.5">
      <div className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-mist-500">
        <Filter size={11} aria-hidden="true" />
        <span>Filtered by</span>
      </div>

      {active.map((dimension) => (
        <button
          key={dimension}
          type="button"
          onClick={() => onClear(dimension)}
          className="group flex items-center gap-2 rounded-xl border border-sage-400/40 bg-forest-950 px-2.5 py-1 text-xs text-mist-100 shadow-xs transition-all hover:border-sage-400 hover:bg-forest-850"
        >
          <span className="font-mono text-[10px] text-mist-500">{DIMENSION_LABELS[dimension]}:</span>
          <span className="font-medium text-sage-300">{labelFor(dimension, filters[dimension] ?? null)}</span>
          <span className="grid size-4 place-items-center rounded-full bg-forest-850 text-mist-500 group-hover:bg-sage-400 group-hover:text-forest-950 transition-colors">
            <X size={10} aria-hidden="true" />
          </span>
        </button>
      ))}

      {active.length > 1 && (
        <button
          type="button"
          onClick={() => {
            for (const d of active) onClear(d);
          }}
          className="font-mono text-[10px] text-mist-500 hover:text-mist-100 underline decoration-dotted transition-colors ml-1"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
