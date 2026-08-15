import { Check, Clock, Copy, History, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EVENT_PAGE, formatMoment, labelFor } from "./labels";
import { formatBytes } from "../../utils/format.mjs";
import type { Report } from "../../utils/report.d.mts";

/** The events themselves, displayed as a clean flat list with tabular columns. */
export function EventLog({
  report,
  shown,
  onShowMore,
  onShownChange,
}: {
  report: Report;
  shown: number;
  onShowMore: () => void;
  onShownChange?: (count: number) => void;
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const visible = report.events.slice(0, shown);

  const pageOptions = useMemo(() => {
    const total = report.events.length;
    if (total <= 10) return [];
    const opts: number[] = [];
    for (let i = 10; i < total; i += 10) {
      opts.push(i);
    }
    opts.push(total);
    return opts;
  }, [report.events.length]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) setOpen(false);
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

  async function handleCopy(path: string | null, index: number) {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs transition-all">
      <div className="flex items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div className="flex items-center gap-2">
          <History size={14} className="text-mist-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-mist-100">
            Cleanup Event Log
          </h2>
        </div>

        {pageOptions.length > 0 ? (
          <div className="relative font-mono text-xs text-mist-500" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-haspopup="listbox"
              aria-expanded={open}
              className="font-semibold text-mist-100 underline decoration-mist-500 decoration-dotted underline-offset-4 transition-colors hover:text-sage-300 hover:decoration-sage-400 cursor-pointer"
            >
              {visible.length}
            </button>
            {" "}of {report.events.length} {report.events.length === 1 ? "event" : "events"}

            {open && (
              <ul
                role="listbox"
                className="absolute right-0 top-full z-30 mt-1.5 min-w-28 max-h-60 overflow-y-auto rounded-xl border border-forest-800 bg-forest-900 p-1 shadow-2xl"
              >
                {pageOptions.map((count) => {
                  const isSelected =
                    visible.length === count ||
                    (count === report.events.length && shown >= report.events.length);
                  return (
                    <li key={count}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onShownChange?.(count);
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1 text-left text-xs font-mono transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-forest-800 text-sage-300 font-medium"
                            : "text-mist-300 hover:bg-forest-850 hover:text-mist-100"
                        }`}
                      >
                        <span>{count === report.events.length ? `All (${count})` : count}</span>
                        {isSelected && <Check size={11} className="text-sage-400" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <span className="font-mono text-xs text-mist-500">
            {visible.length} of {report.events.length} {report.events.length === 1 ? "event" : "events"}
          </span>
        )}
      </div>

      {report.events.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-mist-500">No cleanup recorded in this window.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-forest-800">
            {visible.map((event, position) => {
              const isCopied = copiedIndex === position;
              return (
                <li
                  key={`${event.at}-${position}`}
                  className="group flex flex-wrap items-center justify-between gap-3 py-3 transition-colors hover:bg-forest-850/30 px-1 rounded-lg"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="w-36 shrink-0 whitespace-nowrap font-mono text-[11px] text-mist-500">
                      {formatMoment(event.at)}
                    </span>

                    <div className="min-w-0 flex-1 flex items-center gap-1.5">
                      <span
                        onClick={() => handleCopy(event.path, position)}
                        className="truncate font-mono text-xs text-mist-100 cursor-pointer hover:text-sage-300 transition-colors"
                        title={event.path ?? "Path not recorded"}
                      >
                        {event.path ?? "Path not recorded"}
                      </span>

                      {event.path && (
                        <button
                          type="button"
                          onClick={() => handleCopy(event.path, position)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-mist-500 hover:text-mist-100"
                          title="Copy path"
                          aria-label="Copy path"
                        >
                          {isCopied ? <Check size={11} className="text-sage-300" /> : <Copy size={11} />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded border border-forest-800 bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] font-medium text-sage-300">
                      {labelFor("category", event.category)}
                    </span>

                    {event.trigger === "Scheduled" && (
                      <span className="inline-flex items-center gap-1 rounded bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
                        <Clock size={10} aria-hidden="true" /> schedule
                      </span>
                    )}

                    {event.mode === "Permanent" ? (
                      <span className="inline-flex items-center gap-1 rounded border border-coral-300/30 bg-coral-300/10 px-1.5 py-0.5 font-mono text-[10px] text-coral-300">
                        <Trash2 size={10} aria-hidden="true" /> nuke
                      </span>
                    ) : (
                      <span className="rounded bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
                        trash
                      </span>
                    )}

                    <span className="w-20 text-right font-mono text-xs font-bold text-sage-300">
                      {formatBytes(event.freedBytes)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {report.events.length > visible.length && (
            <div className="border-t border-forest-800 pt-3">
              <button
                type="button"
                onClick={onShowMore}
                className="w-full rounded-xl border border-forest-800 bg-forest-900 py-2 text-xs font-medium text-mist-300 shadow-xs transition-all hover:border-sage-400 hover:bg-forest-850 hover:text-mist-100"
              >
                Show {Math.min(EVENT_PAGE, report.events.length - visible.length)} more events
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
