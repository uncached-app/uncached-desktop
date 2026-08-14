import { ArrowRight, Clock, HardDrive, Sparkles, TrendingDown, TrendingUp, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import { useCleanupHistory } from "../hooks/useWorkspaceHistory";
import { buildInsights } from "../utils/insights.mjs";
import { DIMENSIONS, RANGES, buildReport } from "../utils/report.mjs";
import type { BreakdownRow, Dimension, Filters, Report } from "../utils/report.d.mts";
import { categoryPresentation } from "../components/findings/TargetCard";
import { formatBytes } from "../utils/format";
import { openExternalUrl } from "../utils/externalLink";
import type { Verdict } from "../types/workspace";

type Insight = {
  id: string;
  text: string;
  action?:
    | { kind: "verdict"; verdict: Verdict }
    | { kind: "project"; path: string }
    | { kind: "category"; category: string }
    | { kind: "duplicates" };
};

const DIMENSION_LABELS: Record<Dimension, string> = {
  category: "Artifact",
  workspace: "Workspace",
  trigger: "Started by",
  mode: "Removed to",
};

/** How many cleanups the log shows before it stops being a list. */
const EVENT_PAGE = 40;

/** The value written when the event predates the dimension it is missing. */
const UNRECORDED = "Unrecorded";

function labelFor(dimension: Dimension, key: string | null) {
  if (key === null) return UNRECORDED;
  if (dimension === "category") return categoryPresentation(key).label;
  if (dimension === "workspace") {
    const segments = key.split("/").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : key;
  }
  if (dimension === "mode") return key === "Trash" ? "Recycle Bin" : "Permanently";
  return key === "Scheduled" ? "A schedule" : "You";
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMoment(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The cleanup history, and what the last scan says about the present.
 *
 * The report is the module: every number in it is a sum over events written
 * when a target actually left the disk, and nothing on this screen estimates,
 * projects or smooths. That is what makes it answerable — "was that run me or a
 * schedule" is a question a chart can only settle if the answer was recorded at
 * the time.
 *
 * The arithmetic lives in `report.mjs`, tested without a window. This file asks
 * for a window and a set of filters, and draws what comes back.
 */
export function InsightsModule({
  proEnabled,
  onOpenWorkspace,
}: {
  proEnabled: boolean;
  onOpenWorkspace: () => void;
}) {
  const flow = usePurgeFlow();
  const reducedMotion = useReducedMotion();
  const projects = flow.index.index?.projects ?? [];
  const { events, totals, loading } = useCleanupHistory();

  const [rangeId, setRangeId] = useState("30d");
  const [filters, setFilters] = useState<Filters>({});
  const [shown, setShown] = useState(EVENT_PAGE);

  const range = RANGES.find((entry) => entry.id === rangeId) ?? RANGES[1];
  const report = useMemo(
    () => buildReport({ events, rangeDays: range.days, filters }) as Report,
    [events, range.days, filters],
  );

  const insights = useMemo(
    () => buildInsights({ projects, footprints: flow.footprints, verdicts: flow.verdicts, totals, formatBytes }) as Insight[],
    [projects, flow.footprints, flow.verdicts, totals],
  );

  function toggleFilter(dimension: Dimension, key: string | null) {
    // Selecting the value already selected clears it: one click in, one click
    // out, without a separate control to find.
    setFilters((current) => ({ ...current, [dimension]: current[dimension] === key ? null : key }));
    setShown(EVENT_PAGE);
  }

  function follow(insight: Insight) {
    if (!insight.action) return;
    if (insight.action.kind === "verdict") flow.setActiveVerdict(insight.action.verdict);
    onOpenWorkspace();
  }

  const active = DIMENSIONS.filter((dimension) => filters[dimension] != null);
  const hasHistory = events.length > 0;

  return (
    <section aria-label="Insights" className="flex h-full w-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-forest-800 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-mist-100">Insights</h1>
            <p className="mt-1.5 text-sm text-mist-500">
              {proEnabled
                ? "Every cleanup this machine has recorded, and what the last scan adds up to."
                : "What the last scan adds up to. Pro keeps the record of every cleanup."}
            </p>
          </div>

          {proEnabled && hasHistory && (
            <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-forest-800 bg-forest-900 p-0.5">
              {RANGES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setRangeId(entry.id);
                    setShown(EVENT_PAGE);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                    entry.id === rangeId
                      ? "bg-forest-800 text-mist-100"
                      : "text-mist-500 hover:text-mist-300"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pt-5 pb-6 [scrollbar-gutter:stable]">
        {!proEnabled && <ProPanel />}

        {proEnabled && !loading && !hasHistory && <NoHistoryYet />}

        {proEnabled && hasHistory && (
          <div className="grid gap-4">
            {active.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
                  Filtered to
                </span>
                {active.map((dimension) => (
                  <button
                    key={dimension}
                    type="button"
                    onClick={() => toggleFilter(dimension, null)}
                    className="group flex items-center gap-1.5 rounded-lg border border-sage-400/40 bg-forest-900 px-2.5 py-1 text-xs text-mist-100 transition-colors hover:border-sage-400"
                  >
                    <span className="text-mist-500">{DIMENSION_LABELS[dimension]}</span>
                    {labelFor(dimension, filters[dimension] ?? null)}
                    <X size={12} className="text-mist-500 group-hover:text-mist-100" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}

            <Summary report={report} rangeLabel={range.label} />
            <Timeline report={report} />

            <div className="grid gap-4 lg:grid-cols-2">
              {DIMENSIONS.map((dimension) => (
                <Breakdown
                  key={dimension}
                  dimension={dimension}
                  rows={report.breakdowns[dimension]}
                  selected={filters[dimension] ?? null}
                  onSelect={(key) => toggleFilter(dimension, key)}
                />
              ))}
            </div>

            <EventLog
              report={report}
              shown={shown}
              onShowMore={() => setShown((current) => current + EVENT_PAGE)}
            />
          </div>
        )}

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-3 border-t border-forest-800 pt-5">
            <h2 className="text-sm font-semibold text-mist-100">From the last scan</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </span>
          </div>

          {insights.length === 0 ? (
            <div className="py-10 text-center">
              <Sparkles size={24} className="mx-auto text-mist-500" strokeWidth={1.5} aria-hidden="true" />
              {/* Silence is a result. Filling this space would mean inventing a
                  finding, which is the one thing this module must not do. */}
              <p className="mt-3 text-sm font-semibold text-mist-300">Nothing stands out.</p>
              <p className="mt-1 text-xs text-mist-500">
                {projects.length === 0
                  ? "Scan a workspace and this fills in."
                  : "No project is cold, oversized, duplicated or out of step with its lockfile."}
              </p>
            </div>
          ) : (
            <ul className="mt-3 grid gap-2.5">
              {insights.map((insight, position) => (
                <motion.li
                  key={insight.id}
                  initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: position * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  {insight.action ? (
                    <button
                      type="button"
                      onClick={() => follow(insight)}
                      className="group flex w-full items-center gap-4 rounded-2xl border border-forest-800 bg-forest-900 px-4 py-3.5 text-left transition-colors hover:border-sage-400"
                    >
                      <span className="min-w-0 flex-1 text-sm leading-6 text-mist-100">{insight.text}</span>
                      <ArrowRight
                        size={15}
                        className="shrink-0 text-mist-500 transition-colors group-hover:text-sage-300"
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <p className="rounded-2xl border border-forest-800 bg-forest-950 px-4 py-3.5 text-sm leading-6 text-mist-500">
                      {insight.text}
                    </p>
                  )}
                </motion.li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

/** The four numbers, and whether the window beat the one before it. */
function Summary({ report, rangeLabel }: { report: Report; rangeLabel: string }) {
  const { totals, trend } = report;
  const up = (trend ?? 0) > 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-forest-800 bg-forest-900 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">Reclaimed</p>
        <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-sage-300">
          {formatBytes(totals.freedBytes)}
        </p>
        {trend === null ? (
          <p className="mt-1 text-xs text-mist-500">Last {rangeLabel.toLowerCase()}</p>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-mist-500">
            {up ? (
              <TrendingUp size={13} className="text-sage-300" aria-hidden="true" />
            ) : (
              <TrendingDown size={13} aria-hidden="true" />
            )}
            {Math.abs(Math.round(trend * 100))}% {up ? "more" : "less"} than the previous {rangeLabel.toLowerCase()}
          </p>
        )}
      </div>

      <Stat label="Cleanups" value={String(totals.cleanups)} note={`across ${totals.activeDays} ${totals.activeDays === 1 ? "day" : "days"}`} />
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

/**
 * The window, bucket by bucket.
 *
 * Empty buckets are drawn as empty rather than skipped: a chart built only from
 * the days something happened reports a cadence that never existed.
 */
function Timeline({ report }: { report: Report }) {
  const peak = report.series.reduce((most, bucket) => Math.max(most, bucket.bytes), 0);

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
          Reclaimed by {report.bucket}
        </p>
        <p className="font-mono text-[10px] text-mist-500">
          peak {peak > 0 ? formatBytes(peak) : "—"}
        </p>
      </div>

      <div className="mt-4 flex h-32 items-end gap-[3px]" role="img" aria-label="Reclaimed disk over time">
        {report.series.map((bucket) => (
          <div
            key={bucket.start}
            title={`${formatDay(bucket.start)} — ${formatBytes(bucket.bytes)}, ${bucket.cleanups} ${bucket.cleanups === 1 ? "cleanup" : "cleanups"}`}
            className="flex h-full flex-1 items-end"
          >
            <div
              className={`w-full rounded-sm transition-colors ${bucket.bytes > 0 ? "bg-sage-400 hover:bg-sage-500" : "bg-forest-800"}`}
              style={{ height: bucket.bytes > 0 && peak > 0 ? `${Math.max(3, (bucket.bytes / peak) * 100)}%` : "2px" }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-between font-mono text-[10px] text-mist-500">
        <span>{report.series.length > 0 ? formatDay(report.series[0].start) : ""}</span>
        <span>{report.series.length > 0 ? formatDay(report.series[report.series.length - 1].start) : ""}</span>
      </div>
    </div>
  );
}

/** One dimension, ranked, and clickable because a rank you cannot follow is a caption. */
function Breakdown({
  dimension,
  rows,
  selected,
  onSelect,
}: {
  dimension: Dimension;
  rows: BreakdownRow[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
        {DIMENSION_LABELS[dimension]}
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-mist-500">Nothing in this window.</p>
      ) : (
        <ul className="mt-3 grid gap-1.5">
          {rows.slice(0, 6).map((row) => (
            <li key={row.key ?? UNRECORDED}>
              <button
                type="button"
                onClick={() => onSelect(row.key)}
                className={`group relative w-full overflow-hidden rounded-lg px-2.5 py-2 text-left transition-colors ${
                  selected === row.key ? "bg-forest-800" : "hover:bg-forest-850"
                }`}
              >
                {/* The bar is the row's own background rather than a separate
                    column: the share is the shape of the line you are reading. */}
                <span
                  className="absolute inset-y-0 left-0 bg-sage-400/12"
                  style={{ width: `${Math.round(row.share * 100)}%` }}
                  aria-hidden="true"
                />
                <span className="relative flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-mist-100">
                    {labelFor(dimension, row.key)}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-mist-300">{formatBytes(row.bytes)}</span>
                </span>
                <span className="relative mt-0.5 block font-mono text-[10px] text-mist-500">
                  {row.cleanups} {row.cleanups === 1 ? "cleanup" : "cleanups"} · {Math.round(row.share * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The events themselves. A report that cannot be checked against its own rows is a claim. */
function EventLog({
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
              <li
                key={`${event.at}-${position}`}
                className="flex items-center gap-3 bg-forest-950 px-3 py-2.5"
              >
                <span className="w-28 shrink-0 font-mono text-[11px] text-mist-500">
                  {formatMoment(event.at)}
                </span>
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

/** Pro is the only plan that writes anything down, so this is what Free sees instead. */
function ProPanel() {
  return (
    <div className="rounded-2xl border border-pro-200/30 bg-pro-surface p-5">
      <p className="text-sm font-semibold text-mist-100">Your cleanup history is a Pro feature</p>
      <p className="mt-1.5 max-w-prose text-xs leading-5 text-mist-500">
        Free reads the machine fresh every time and writes nothing down. Pro records every cleanup —
        including the ones a schedule runs while you are not looking — and reports them back: how
        much came off the disk, from which workspace, which ecosystem it belonged to, and how this
        month compares with the last.
      </p>
      <button
        type="button"
        onClick={() => openExternalUrl("https://uncached.app/pro")}
        className="mt-4 rounded-xl bg-pro-200 px-3 py-2 text-xs font-semibold text-forest-950 transition-colors hover:bg-pro-100"
      >
        Get Uncached Pro
      </button>
    </div>
  );
}

/** Pro, but nothing reclaimed yet. Saying so beats an empty chart. */
function NoHistoryYet() {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 py-12 text-center">
      <HardDrive size={26} className="mx-auto text-mist-500" strokeWidth={1.5} aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-mist-300">No cleanup recorded yet.</p>
      <p className="mt-1 text-xs text-mist-500">
        The first one you run starts the history, and this becomes a report.
      </p>
    </div>
  );
}
