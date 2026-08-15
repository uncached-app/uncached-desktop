import { BarChart2 } from "lucide-react";
import { useState } from "react";
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const peak = report.series.reduce((most, bucket) => Math.max(most, bucket.bytes), 0);
  const first = report.series[0];
  const last = report.series[report.series.length - 1];
  const hoveredBucket = hoveredIndex !== null ? report.series[hoveredIndex] : null;

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

        <div className="font-mono text-xs text-mist-500 flex items-center gap-1.5 transition-all">
          {hoveredBucket ? (
            <>
              <span>{formatBucket(hoveredBucket.start, report.bucket)}:</span>
              <span className={`font-semibold ${hoveredBucket.bytes > 0 ? "text-sage-300" : "text-mist-100"}`}>
                {formatBytes(hoveredBucket.bytes)}
              </span>
              <span className="text-mist-500 text-[11px]">
                ({hoveredBucket.cleanups} {hoveredBucket.cleanups === 1 ? "cleanup" : "cleanups"})
              </span>
            </>
          ) : (
            <>
              <span>peak:</span>
              <span className="font-semibold text-mist-100">
                {peak > 0 ? formatBytes(peak) : "—"}
              </span>
            </>
          )}
        </div>
      </div>

      <div
        className="relative mt-5 flex h-36 items-end gap-0.75 rounded-xl bg-forest-950 p-3"
        role="img"
        aria-label="Reclaimed disk over time"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {report.series.map((bucket, index) => {
          const isHovered = hoveredIndex === index;
          return (
            <div
              key={bucket.start}
              onMouseEnter={() => setHoveredIndex(index)}
              className="group relative flex h-full flex-1 cursor-pointer items-end rounded-t transition-colors hover:bg-forest-900/40"
            >
              <div
                className={`w-full rounded-t-sm transition-all duration-150 ${
                  bucket.bytes > 0
                    ? isHovered
                      ? "bg-sage-300 shadow-[0_0_8px_rgba(134,239,172,0.4)]"
                      : "bg-sage-400 group-hover:bg-sage-300"
                    : isHovered
                    ? "bg-forest-700"
                    : "bg-forest-800 group-hover:bg-forest-850"
                }`}
                style={{
                  height: bucket.bytes > 0 && peak > 0 ? `${Math.max(4, (bucket.bytes / peak) * 100)}%` : "2px",
                }}
              />

              {isHovered && (
                <div
                  role="tooltip"
                  className={`pointer-events-none absolute top-2 z-30 flex flex-col gap-0.5 rounded-lg border border-forest-800 bg-forest-900/95 backdrop-blur-xs px-2.5 py-1 font-mono shadow-2xl transition-all whitespace-nowrap ${
                    index < 3
                      ? "left-0"
                      : index > report.series.length - 4
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2"
                  }`}
                >
                  <div className="text-[10px] text-mist-500">
                    {formatBucket(bucket.start, report.bucket)}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-mist-100">
                    <span className={bucket.bytes > 0 ? "text-sage-300" : "text-mist-500"}>
                      {formatBytes(bucket.bytes)}
                    </span>
                    <span className="text-[10px] font-normal text-mist-500">
                      · {bucket.cleanups} {bucket.cleanups === 1 ? "cleanup" : "cleanups"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex justify-between font-mono text-[10px] text-mist-500">
        <span>{first ? formatBucket(first.start, report.bucket) : ""}</span>
        <span>{last ? formatBucket(last.start, report.bucket) : ""}</span>
      </div>
    </div>
  );
}
