import { useMemo, useState } from "react";
import { Breakdown } from "./insights/Breakdown";
import { Duplicates } from "./insights/Duplicates";
import { EventLog } from "./insights/EventLog";
import { FilterChips } from "./insights/FilterChips";
import { Highlights } from "./insights/Highlights";
import { Summary } from "./insights/Summary";
import { Timeline } from "./insights/Timeline";
import { EVENT_PAGE } from "./insights/labels";
import { NoHistoryYet, ProPanel } from "./insights/states";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import { useCleanupHistory } from "../hooks/useWorkspaceHistory";
import { useDuplicatePackages } from "../hooks/useDuplicatePackages";
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
  // Memoised: the hook keys its work on this array, and a fresh one every render
  // would rebuild the callback on every keystroke elsewhere on the screen.
  const projectPaths = useMemo(() => projects.map((project) => project.path), [projects]);
  const duplicates = useDuplicatePackages(projectPaths);

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
      <header className="shrink-0 border-b border-forest-800 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-mist-100 sm:text-3xl">Insights</h1>
            <span className="rounded-lg border border-forest-800 bg-forest-900 px-2.5 py-0.5 font-mono text-xs font-medium text-sage-300">
              {proEnabled ? "Analytics & Trends" : "Scan Intelligence"}
            </span>
          </div>
        </div>

        <p className="mt-1.5 text-xs text-mist-500 max-w-2xl">
          {proEnabled
            ? "Every recorded cleanup, disk recovery velocity, and what the last scan adds up to."
            : "Live telemetry from your workspace. Upgrade to Pro to track lifetime recovery history and trends."}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pr-2 pt-5 pb-8 scrollbar-gutter-stable">
        {!proEnabled && <div className="mb-5"><ProPanel /></div>}
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

        {/* Below the highlights because it is the one section here that costs
            something to produce: it reads every node_modules in the workspace,
            and it only does so when asked. */}
        <div className="mt-4">
          <Duplicates
            report={duplicates.report}
            running={duplicates.running}
            error={duplicates.error}
            projectCount={projects.length}
            proEnabled={proEnabled}
            onScan={duplicates.scan}
          />
        </div>
      </div>
    </section>
  );
}
