import { GrainPicker } from "./GrainPicker";
import { formatBucket } from "./labels";
import { formatBytes } from "../../utils/format";
import type { Report } from "../../utils/report.d.mts";

/**
 * The window, bucket by bucket.
 *
 * Empty buckets are drawn as empty rather than skipped: a chart built only from
 * the days something happened reports a cadence that never existed.
 */
export function Timeline({ report, onGrain }: { report: Report; onGrain: (grain: string) => void }) {
  const peak = report.series.reduce((most, bucket) => Math.max(most, bucket.bytes), 0);
  const first = report.series[0];
  const last = report.series[report.series.length - 1];

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5">
      <div className="flex items-baseline justify-between gap-3">
        {/* The window has no control of its own: it is the last word of the
            sentence that describes the chart, and changing it is changing that
            word. One affordance instead of a row of tabs saying the same thing. */}
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
          Reclaimed {report.grain.buckets === null ? "" : "by "}
          <GrainPicker grain={report.grain} onSelect={onGrain} />
        </p>
        <p className="font-mono text-[10px] text-mist-500">peak {peak > 0 ? formatBytes(peak) : "—"}</p>
      </div>

      <div className="mt-4 flex h-32 items-end gap-[3px]" role="img" aria-label="Reclaimed disk over time">
        {report.series.map((bucket) => (
          <div
            key={bucket.start}
            title={`${formatBucket(bucket.start, report.bucket)} — ${formatBytes(bucket.bytes)}, ${bucket.cleanups} ${bucket.cleanups === 1 ? "cleanup" : "cleanups"}`}
            className="flex h-full flex-1 items-end"
          >
            <div
              className={`w-full rounded-sm transition-colors ${bucket.bytes > 0 ? "bg-sage-400 hover:bg-sage-500" : "bg-forest-800"}`}
              style={{
                height: bucket.bytes > 0 && peak > 0 ? `${Math.max(3, (bucket.bytes / peak) * 100)}%` : "2px",
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-between font-mono text-[10px] text-mist-500">
        <span>{first ? formatBucket(first.start, report.bucket) : ""}</span>
        <span>{last ? formatBucket(last.start, report.bucket) : ""}</span>
      </div>
    </div>
  );
}
