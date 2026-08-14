import { TrendingDown, TrendingUp } from "lucide-react";
import { formatBytes } from "../../utils/format";
import type { Report } from "../../utils/report.d.mts";

/** The four numbers, and whether the window beat the one before it. */
export function Summary({ report }: { report: Report }) {
  const { totals, trend } = report;
  const window = report.grain.window;
  const up = (trend ?? 0) > 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-forest-800 bg-forest-900 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">Reclaimed</p>
        <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-sage-300">
          {formatBytes(totals.freedBytes)}
        </p>
        {/* Null is not zero: "no change" and "nothing to compare with" are
            different answers, and only one of them is a trend. */}
        {trend === null ? (
          <p className="mt-1 text-xs text-mist-500">
            {report.grain.buckets === null ? "All time" : `Last ${window}`}
          </p>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-mist-500">
            {up ? (
              <TrendingUp size={13} className="text-sage-300" aria-hidden="true" />
            ) : (
              <TrendingDown size={13} aria-hidden="true" />
            )}
            {Math.abs(Math.round(trend * 100))}% {up ? "more" : "less"} than the previous {window}
          </p>
        )}
      </div>

      <Stat
        label="Cleanups"
        value={String(totals.cleanups)}
        note={`across ${totals.activeDays} ${totals.activeDays === 1 ? "day" : "days"}`}
      />
      <Stat label="Largest" value={formatBytes(totals.largestBytes)} note="in a single artifact" />
      <Stat label="Average" value={formatBytes(totals.averageBytes)} note="per cleanup" />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-mist-100">{value}</p>
      <p className="mt-1 text-xs text-mist-500">{note}</p>
    </div>
  );
}
