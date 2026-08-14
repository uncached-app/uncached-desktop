import { X } from "lucide-react";
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">Filtered to</span>
      {active.map((dimension) => (
        <button
          key={dimension}
          type="button"
          onClick={() => onClear(dimension)}
          className="group flex items-center gap-1.5 rounded-lg border border-sage-400/40 bg-forest-900 px-2.5 py-1 text-xs text-mist-100 transition-colors hover:border-sage-400"
        >
          <span className="text-mist-500">{DIMENSION_LABELS[dimension]}</span>
          {labelFor(dimension, filters[dimension] ?? null)}
          <X size={12} className="text-mist-500 group-hover:text-mist-100" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
