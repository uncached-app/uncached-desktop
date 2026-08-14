import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GRAINS } from "../../utils/report.mjs";
import type { Grain } from "../../utils/report.d.mts";

/**
 * The grain, as the word it is.
 *
 * Underlined because that is what a word you can change looks like, and closed
 * by anything that means "not this" — a click elsewhere, Escape, or a choice.
 */
export function GrainPicker({ grain, onSelect }: { grain: Grain; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: MouseEvent) {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <span ref={anchor} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-100 underline decoration-mist-500 decoration-dotted underline-offset-4 transition-colors hover:decoration-sage-400"
      >
        {grain.label}
        <ChevronDown size={10} aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-20 mt-2 min-w-36 overflow-hidden rounded-xl border border-forest-800 bg-forest-900 py-1 shadow-xl"
        >
          {GRAINS.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                role="option"
                aria-selected={entry.id === grain.id}
                onClick={() => {
                  onSelect(entry.id);
                  setOpen(false);
                }}
                className={`flex w-full items-baseline justify-between gap-4 px-3 py-1.5 text-left text-xs transition-colors ${
                  entry.id === grain.id
                    ? "bg-forest-800 text-mist-100"
                    : "text-mist-300 hover:bg-forest-850 hover:text-mist-100"
                }`}
              >
                {entry.id === "all" ? "All time" : `By ${entry.label}`}
                {/* The window is what the grain costs you: choosing days is
                    choosing to see a month. Saying it beside the word is the
                    only thing the dropdown owes the reader. */}
                <span className="font-mono text-[10px] text-mist-500">
                  {entry.buckets === null ? "" : entry.window}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
