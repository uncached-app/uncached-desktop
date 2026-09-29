import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, HardDrive, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "../../utils/format.mjs";
import type { Report } from "../../utils/report.d.mts";

/** The four numbers, and whether the window beat the one before it. */
export function Summary({ report }: { report: Report }) {
  const { t } = useTranslation();
  const { totals, trend, grain } = report;
  const up = (trend ?? 0) > 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Primary Reclaimed Card */}
      <div className="relative overflow-hidden rounded-2xl border border-forest-800 bg-forest-900 p-4.5 transition-all hover:border-sage-400/40">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-mist-500">
            {t("insights.summary.reclaimed")}
          </p>
          <span className="grid size-6 place-items-center rounded-md bg-sage-400/10 text-sage-300">
            <HardDrive size={13} aria-hidden="true" />
          </span>
        </div>

        <p className="mt-2.5 font-mono text-2xl font-bold tracking-tight text-sage-300 sm:text-3xl">
          {formatBytes(totals.freedBytes)}
        </p>

        {/* Trend line */}
        <div className="mt-2 flex items-center gap-1.5">
          {trend === null ? (
            <span className="font-mono text-xs text-mist-500">
              {grain.id === "all"
                ? t("insights.summary.allRecorded")
                : t(`insights.summary.last.${grain.id}`, { count: grain.buckets })}
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium ${
                up
                  ? "border border-sage-400/30 bg-sage-400/10 text-sage-300"
                  : "border border-forest-800 bg-forest-850 text-mist-300"
              }`}
            >
              {up ? (
                <ArrowUpRight size={12} className="text-sage-300" aria-hidden="true" />
              ) : (
                <ArrowDownRight size={12} aria-hidden="true" />
              )}
              <span>{t("insights.summary.trend", { percent: Math.abs(Math.round(trend * 100)) })}</span>
              {grain.id !== "all" && (
                <span className="font-sans text-mist-500">
                  {t(`insights.summary.versus.${grain.id}`, { count: grain.buckets })}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      <StatCard
        label={t("insights.summary.cleanups")}
        icon={Activity}
        value={String(totals.cleanups)}
        note={t("insights.summary.activeDays", { count: totals.activeDays })}
      />

      <StatCard
        label={t("insights.summary.largest")}
        icon={BarChart3}
        value={formatBytes(totals.largestBytes)}
        note={t("insights.summary.largestNote")}
      />

      <StatCard
        label={t("insights.summary.average")}
        icon={Sparkles}
        value={formatBytes(totals.averageBytes)}
        note={t("insights.summary.averageNote")}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-4.5 transition-all hover:border-forest-800">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-mist-500">{label}</p>
        <span className="grid size-6 place-items-center rounded-md bg-forest-850 text-mist-500">
          <Icon size={13} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2.5 font-mono text-2xl font-bold tracking-tight text-mist-100 sm:text-3xl">{value}</p>
      <p className="mt-2 font-mono text-xs text-mist-500">{note}</p>
    </div>
  );
}
