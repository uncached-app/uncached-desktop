import { Clock } from "lucide-react";
import { EVENT_PAGE, formatMoment, labelFor } from "./labels";
import { formatBytes } from "../../utils/format";
import type { Report } from "../../utils/report.d.mts";

/** The events themselves. A report that cannot be checked against its own rows is a claim. */
export function EventLog({
  report,
  shown,
  onShowMore,
}: {
  report: Report;
  shown: number;
  onShowMore: () => void;
}) {
  const visible = report.events.slice(0, shown);

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">Cleanups</p>
        <p className="font-mono text-[10px] text-mist-500">
          {visible.length} of {report.events.length}
        </p>
      </div>

      {report.events.length === 0 ? (
        <p className="mt-3 text-xs text-mist-500">No cleanup in this window.</p>
      ) : (
        <>
          <ul className="mt-3 grid gap-px overflow-hidden rounded-lg">
            {visible.map((event, position) => (
              <li key={`${event.at}-${position}`} className="flex items-center gap-3 bg-forest-950 px-3 py-2.5">
                <span className="w-28 shrink-0 font-mono text-[11px] text-mist-500">{formatMoment(event.at)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-mist-100" title={event.path ?? undefined}>
                  {event.path ?? "Path not recorded"}
                </span>
                <span className="shrink-0 rounded-md bg-forest-800 px-1.5 py-0.5 font-mono text-[10px] text-mist-300">
                  {labelFor("category", event.category)}
                </span>
                {event.trigger === "Scheduled" && (
                  <Clock size={12} className="shrink-0 text-mist-500" aria-label="Started by a schedule" />
                )}
                {event.mode === "Permanent" && (
                  <span className="shrink-0 font-mono text-[10px] text-coral-300">permanent</span>
                )}
                <span className="w-20 shrink-0 text-right font-mono text-xs text-sage-300">
                  {formatBytes(event.freedBytes)}
                </span>
              </li>
            ))}
          </ul>

          {report.events.length > visible.length && (
            <button
              type="button"
              onClick={onShowMore}
              className="mt-3 w-full rounded-lg border border-forest-800 py-2 text-xs text-mist-300 transition-colors hover:border-sage-400 hover:text-mist-100"
            >
              Show {Math.min(EVENT_PAGE, report.events.length - visible.length)} more
            </button>
          )}
        </>
      )}
    </div>
  );
}
