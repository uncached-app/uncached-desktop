import { useMemo, useState } from "react";
import { Breakdown } from "./insights/Breakdown";
import { EventLog } from "./insights/EventLog";
import { FilterChips } from "./insights/FilterChips";
import { Highlights } from "./insights/Highlights";
import { Summary } from "./insights/Summary";
import { Timeline } from "./insights/Timeline";
import { EVENT_PAGE } from "./insights/labels";
import { NoHistoryYet, ProPanel } from "./insights/states";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import { useCleanupHistory } from "../hooks/useWorkspaceHistory";
import { buildInsights } from "../utils/insights.mjs";
import type { Insight } from "../utils/insights.d.mts";
import { DIMENSIONS, buildReport } from "../utils/report.mjs";
import type { Dimension, Filters, Report } from "../utils/report.d.mts";
import { formatBytes } from "../utils/format";
import type { Verdict } from "../types/workspace";

/**
 * The cleanup history, and what the last scan says about the present.
 *
 * The report is the module: every number in it is a sum over events written
 * when a target actually left the disk, and nothing on this screen estimates,
 * projects or smooths. That is what makes it answerable — "was that run me or a
 * schedule" is a question a chart can only settle if the answer was recorded at
 * the time.
 *
 * The arithmetic lives in `report.mjs`, tested without a window. This file holds
 * the two pieces of state the sections share — which window, which filters — and
 * arranges them.
 */
export function InsightsModule({
  proEnabled,
  onOpenWorkspace,
}: {
  proEnabled: boolean;
  onOpenWorkspace: () => void;
}) {
  const flow = usePurgeFlow();
  const projects = flow.index.index?.projects ?? [];
  const { events, totals, loading } = useCleanupHistory();

  const [grain, setGrain] = useState("month");
  const [filters, setFilters] = useState<Filters>({});
  const [shown, setShown] = useState(EVENT_PAGE);

  const report = useMemo(
    () => buildReport({ events, grain, filters }) as Report,
    [events, grain, filters],
  );

  const insights = useMemo(
    () =>
      buildInsights({
        projects,
        footprints: flow.footprints,
        verdicts: flow.verdicts,
        totals,
        formatBytes,
      }) as Insight[],
    [projects, flow.footprints, flow.verdicts, totals],
  );

  function narrow(dimension: Dimension, key: string | null) {
    // Selecting the value already selected clears it: one click in, one click
    // out, without a separate control to find.
    setFilters((current) => ({ ...current, [dimension]: current[dimension] === key ? null : key }));
    setShown(EVENT_PAGE);
  }

  function follow(insight: Insight) {
    if (!insight.action) return;
    if (insight.action.kind === "verdict") flow.setActiveVerdict(insight.action.verdict as Verdict);
    onOpenWorkspace();
  }

  const hasHistory = events.length > 0;

  return (
    <section aria-label="Insights" className="flex h-full w-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-forest-800 pb-4">
        <h1 className="text-2xl font-semibold tracking-[-0.045em] text-mist-100">Insights</h1>
        <p className="mt-1.5 text-sm text-mist-500">
          {proEnabled
            ? "Every cleanup this machine has recorded, and what the last scan adds up to."
            : "What the last scan adds up to. Pro keeps the record of every cleanup."}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pt-5 pb-6 [scrollbar-gutter:stable]">
        {!proEnabled && <ProPanel />}
        {proEnabled && !loading && !hasHistory && <NoHistoryYet />}

        {proEnabled && hasHistory && (
          <div className="grid gap-4">
            <FilterChips filters={filters} onClear={(dimension) => narrow(dimension, null)} />

            <Summary report={report} />
            <Timeline
              report={report}
              onGrain={(next) => {
                setGrain(next);
                setShown(EVENT_PAGE);
              }}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              {(DIMENSIONS as Dimension[]).map((dimension) => (
                <Breakdown
                  key={dimension}
                  dimension={dimension}
                  rows={report.breakdowns[dimension]}
                  selected={filters[dimension] ?? null}
                  onSelect={(key) => narrow(dimension, key)}
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

        <Highlights insights={insights} projectCount={projects.length} onFollow={follow} />
      </div>
    </section>
  );
}
