import { BarChart2 } from "lucide-react";
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
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-mist-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-mist-100 flex items-center gap-1.5">
            <span>Reclaimed</span>
            {report.grain.buckets !== null && <span>by</span>}
            <GrainPicker grain={report.grain} onSelect={onGrain} />
          </h2>
        </div>

        <div className="font-mono text-xs text-mist-500 flex items-center gap-1.5">
          <span>peak:</span>
          <span className="font-semibold text-mist-100">
            {peak > 0 ? formatBytes(peak) : "—"}
          </span>
        </div>
      </div>

      <div className="mt-5 flex h-36 items-end gap-0.75 rounded-xl bg-forest-950 p-3" role="img" aria-label="Reclaimed disk over time">
        {report.series.map((bucket) => (
          <div
            key={bucket.start}
            title={`${formatBucket(bucket.start, report.bucket)} — ${formatBytes(bucket.bytes)}, ${bucket.cleanups} ${bucket.cleanups === 1 ? "cleanup" : "cleanups"}`}
            className="group flex h-full flex-1 cursor-pointer items-end"
          >
            <div
              className={`w-full rounded-t-sm transition-all duration-150 ${bucket.bytes > 0
                  ? "bg-sage-400 group-hover:bg-sage-300"
                  : "bg-forest-800 group-hover:bg-forest-850"
                }`}
              style={{
                height: bucket.bytes > 0 && peak > 0 ? `${Math.max(4, (bucket.bytes / peak) * 100)}%` : "2px",
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex justify-between font-mono text-[10px] text-mist-500">
        <span>{first ? formatBucket(first.start, report.bucket) : ""}</span>
        <span>{last ? formatBucket(last.start, report.bucket) : ""}</span>
      </div>
    </div>
  );
}
