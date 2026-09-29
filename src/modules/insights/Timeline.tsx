import { BarChart2 } from "lucide-react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { GrainPicker } from "./GrainPicker";
import { formatBucket } from "./labels";
import { formatBytes } from "../../utils/format.mjs";
import type { Report } from "../../utils/report.d.mts";

/**
 * The window, bucket by bucket.
 *
 * Empty buckets are drawn as empty rather than skipped: a chart built only from
 * the days something happened reports a cadence that never existed.
 */
export function Timeline({ report, onGrain }: { report: Report; onGrain: (grain: string) => void }) {
  const { t, i18n } = useTranslation();
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
            <Trans
              i18nKey={
                report.grain.buckets === null
                  ? "insights.timeline.titleAllTime"
                  : "insights.timeline.titleByGrain"
              }
              components={{
                word: <span />,
                picker: <GrainPicker grain={report.grain} onSelect={onGrain} />,
              }}
            />
          </h2>
        </div>

        <div className="font-mono text-xs text-mist-500 flex items-center gap-1.5 transition-all">
          {hoveredBucket ? (
            <>
              <span>
                {t("insights.timeline.bucket", {
                  date: formatBucket(hoveredBucket.start, report.bucket, i18n.language),
                })}
              </span>
              <span className={`font-semibold ${hoveredBucket.bytes > 0 ? "text-sage-300" : "text-mist-100"}`}>
                {formatBytes(hoveredBucket.bytes)}
              </span>
              <span className="text-mist-500 text-[11px]">
                {t("insights.timeline.bucketCleanups", { count: hoveredBucket.cleanups })}
              </span>
            </>
          ) : (
            <>
              <span>{t("insights.timeline.peak")}</span>
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
        aria-label={t("insights.timeline.chartLabel")}
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
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex justify-between font-mono text-[10px] text-mist-500">
        <span>{first ? formatBucket(first.start, report.bucket, i18n.language) : ""}</span>
        <span>{last ? formatBucket(last.start, report.bucket, i18n.language) : ""}</span>
      </div>
    </div>
  );
}
