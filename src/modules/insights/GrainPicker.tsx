import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GRAINS } from "../../utils/report.mjs";
import type { Grain } from "../../utils/report.d.mts";

/**
 * The grain, as the word it is.
 *
 * Underlined because that is what a word you can change looks like, and closed
 * by anything that means "not this" — a click elsewhere, Escape, or a choice.
 */
export function GrainPicker({ grain, onSelect }: { grain: Grain; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
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
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-100 underline decoration-mist-500 decoration-dotted underline-offset-4 transition-colors hover:text-sage-300 hover:decoration-sage-400"
      >
        {t(`insights.grains.word.${grain.id}`)}
        <ChevronDown size={11} className={`text-mist-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute start-0 top-full z-30 mt-2 min-w-44 overflow-hidden rounded-xl border border-forest-800 bg-forest-900 p-1 shadow-2xl"
        >
          {GRAINS.map((entry) => {
            const isSelected = entry.id === grain.id;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelect(entry.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-start text-xs transition-colors ${
                    isSelected
                      ? "bg-forest-800 text-mist-100 font-medium"
                      : "text-mist-300 hover:bg-forest-850 hover:text-mist-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Check
                      size={12}
                      className={`text-sage-400 ${isSelected ? "opacity-100" : "opacity-0"}`}
                      aria-hidden="true"
                    />
                    <span>{t(`insights.grains.option.${entry.id}`)}</span>
                  </div>

                  <span className="font-mono text-[10px] text-mist-500">
                    {entry.id === "all"
                      ? ""
                      : t(`insights.grains.window.${entry.id}`, { count: entry.buckets })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </span>
  );
}
