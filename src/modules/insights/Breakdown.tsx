import { Check, Clock, Folder, Package, Trash2 } from "lucide-react";
import { DIMENSION_LABELS, UNRECORDED, labelFor } from "./labels";
import { formatBytes } from "../../utils/format.mjs";
import type { BreakdownRow, Dimension } from "../../utils/report.d.mts";

const DIMENSION_ICONS: Record<Dimension, React.ElementType> = {
  category: Package,
  workspace: Folder,
  trigger: Clock,
  mode: Trash2,
};

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
  const Icon = DIMENSION_ICONS[dimension] ?? Package;

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs transition-all">
      <div className="flex items-center justify-between border-b border-forest-800 pb-3">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-mist-500" aria-hidden="true" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-mist-100">
            {DIMENSION_LABELS[dimension]}
          </h3>
        </div>

        {selected && (
          <span className="rounded-md border border-sage-400/40 bg-sage-400/10 px-2 py-0.5 font-mono text-[10px] font-medium text-sage-300">
            filtered
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-mist-500">Nothing recorded in this window.</p>
      ) : (
        <ul className="divide-y divide-forest-800">
          {rows.slice(0, 6).map((row) => {
            const isRowSelected = selected === row.key;
            return (
              <li key={row.key ?? UNRECORDED}>
                <button
                  type="button"
                  onClick={() => onSelect(row.key)}
                  className={`group relative w-full overflow-hidden px-3 py-2.5 text-left transition-all rounded-r-xl ${
                    isRowSelected ? "bg-forest-850/80" : "hover:bg-forest-850/40"
                  }`}
                >
                  {/* Subtle proportional share progress fill with only right-side rounding */}
                  <span
                    className={`absolute inset-y-0 left-0 transition-all rounded-r-lg rounded-l-none ${
                      isRowSelected ? "bg-sage-400/20" : "bg-sage-400/10 group-hover:bg-sage-400/15"
                    }`}
                    style={{ width: `${Math.max(row.share > 0 ? 2 : 0, Math.round(row.share * 100))}%` }}
                    aria-hidden="true"
                  />

                  <div className="relative flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-xs font-medium text-mist-100 flex items-center gap-1.5">
                      {isRowSelected && <Check size={12} className="text-sage-300 shrink-0" aria-hidden="true" />}
                      <span className="truncate">{labelFor(dimension, row.key)}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs font-semibold text-mist-100">
                      {formatBytes(row.bytes)}
                    </span>
                  </div>

                  <div className="relative mt-1 flex items-center justify-between font-mono text-[10px] text-mist-500">
                    <span>{row.cleanups} {row.cleanups === 1 ? "cleanup" : "cleanups"}</span>
                    <span>{Math.round(row.share * 100)}% share</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
