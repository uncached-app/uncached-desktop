import { Box, Check, Folder, Layers, LoaderCircle, Package, RefreshCw } from "lucide-react";
import type { ScanTarget } from "../../types/scan";

interface TargetCardProps {
  target: ScanTarget;
  isCleaning: boolean;
  selected: boolean;
  onToggle: (targetId: string) => void;
  onRefreshSize: (targetId: string) => void;
}

export function TargetCard({ target, isCleaning, selected, onToggle, onRefreshSize }: TargetCardProps) {
  const disabled = isCleaning || target.sizePending || target.sizeHasErrors;

  function getCategoryIcon(category: string) {
    const cat = category.toUpperCase();
    if (cat.includes("NODE")) return <Package size={12} className="text-sage-300" aria-hidden="true" />;
    if (cat.includes("CARGO") || cat.includes("RUST") || cat.includes("BUILD")) {
      return <Box size={12} className="text-sage-300" aria-hidden="true" />;
    }
    if (cat.includes("FOLDER") || cat.includes("DIR")) {
      return <Folder size={12} className="text-sage-300" aria-hidden="true" />;
    }
    return <Layers size={12} className="text-sage-300" aria-hidden="true" />;
  }

  return (
    <article
      onClick={() => {
        if (!disabled) onToggle(target.id);
      }}
      className={`group grid select-none gap-3 rounded-2xl border p-4 transition-all duration-200 sm:grid-cols-[1fr_auto] sm:items-center ${
          disabled
            ? "cursor-not-allowed border-forest-800 bg-forest-900 text-mist-500"
            : selected
            ? "cursor-pointer border-sage-400 bg-forest-900"
            : "cursor-pointer border-forest-800 bg-forest-900 hover:border-sage-400"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <div
          role="checkbox"
          aria-checked={selected}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !disabled) {
              e.preventDefault();
              onToggle(target.id);
            }
          }}
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-all ${
            selected
              ? "border-sage-400 bg-sage-400 text-forest-950"
              : "border-forest-700 bg-forest-950 text-transparent group-hover:border-sage-400"
          }`}
        >
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-forest-800 bg-forest-800 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-sage-300">
              {getCategoryIcon(target.category)}
              {target.category}
            </span>
            <span className="text-xs text-mist-500 font-medium">{target.name}</span>
          </div>

          <p
              className="mt-1.5 truncate font-mono text-xs leading-5 text-mist-500"
            title={target.path}
          >
            {target.path}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pl-8 sm:pl-0">
        <div className="text-right">
          {target.sizePending ? (
            <span className="inline-flex items-center gap-2 text-sm text-mist-500">
              <LoaderCircle size={16} className="animate-spin text-sage-400" aria-hidden="true" /> Loading size
            </span>
          ) : target.sizeHasErrors ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRefreshSize(target.id);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-forest-800 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-forest-850"
              aria-label={`Retry size for ${target.name}`}
            >
              <RefreshCw size={13} aria-hidden="true" /> Retry
            </button>
          ) : (
            <strong className={`block text-lg font-semibold ${selected ? "text-mist-100" : "text-mist-300"}`}>
              {target.formattedSize}
            </strong>
          )}
        </div>
      </div>
    </article>
  );
}
