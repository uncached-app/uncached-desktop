import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, RefreshCw } from "lucide-react";
import { Breakdown } from "./insights/Breakdown";
import { Duplicates } from "./insights/Duplicates";
import { Orphans } from "./insights/Orphans";
import { Repositories } from "./insights/Repositories";
import { EventLog } from "./insights/EventLog";
import { FilterChips } from "./insights/FilterChips";
import { Highlights } from "./insights/Highlights";
import { Portrait } from "./insights/Portrait";
import { Summary } from "./insights/Summary";
import { Timeline } from "./insights/Timeline";
import { EVENT_PAGE } from "./insights/labels";
import { NoHistoryYet, ProPanel } from "./insights/states";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import type { AnalysisStage } from "../hooks/useWorkspaceAnalysis";
import { useCleanupHistory } from "../hooks/useWorkspaceHistory";
import { buildInsights } from "../utils/insights.mjs";
import { workspacePortrait } from "../utils/portrait.mjs";
import type { Portrait as PortraitData } from "../utils/portrait.d.mts";
import type { Insight } from "../utils/insights.d.mts";
import { DIMENSIONS, buildReport } from "../utils/report.mjs";
import type { Dimension, Filters, Report } from "../utils/report.d.mts";
import { formatBytes } from "../utils/format.mjs";
import type { Verdict } from "../types/workspace";

/** What each reading is doing, while it is the one running. */
const STAGE_COPY: Record<NonNullable<AnalysisStage>, string> = {
  orphans: "Looking for build folders whose project is gone...",
  repositories: "Reading every repository for dead branches and stashes...",
  duplicates: "Reading every node_modules for identical copies...",
};

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
  grain,
  onGrainChange,
}: {
  proEnabled: boolean;
  onOpenWorkspace: () => void;
  /**
   * Which span the report is read over. Held in settings rather than here: the
   * screen is opened to answer a question, and being asked to choose the span
   * again every time is the screen forgetting which question.
   */
  grain: string;
  onGrainChange: (grain: string) => void;
}) {
  const flow = usePurgeFlow();
  const projects = flow.index.index?.projects ?? [];
  const { events, totals, loading } = useCleanupHistory();
  // Taken once per workspace by the flow provider, so opening this screen shows
  // what it found rather than three buttons, and leaving does not throw it away.
  const { duplicates, repositories, orphans, stage, running, refresh } = flow.analysis;

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

  // The same sums `buildInsights` already makes to produce one sentence about
  // concentration, kept instead of discarded.
  const portrait = useMemo(
    () =>
      workspacePortrait({
        projects,
        footprints: flow.footprints,
        verdicts: flow.verdicts,
      }) as PortraitData,
    [projects, flow.footprints, flow.verdicts],
  );

  function narrow(dimension: Dimension, key: string | null) {
    // Selecting the value already selected clears it: one click in, one click
    // out, without a separate control to find.
    setFilters((current) => ({ ...current, [dimension]: current[dimension] === key ? null : key }));
    setShown(EVENT_PAGE);
  }

  // Every branch has to land somewhere the sentence actually points at. A button
  // reading "View in workspace" that opens an unfiltered workspace is worse than
  // the same sentence with no button — which is what these last two were until
  // the map learned to filter by artifact kind and by clone.
  //
  // Each one clears the others: arriving on a list narrowed by a filter the
  // previous sentence set would show fewer projects than the sentence just
  // claimed, or none at all.
  function follow(insight: Insight) {
    if (!insight.action) return;
    flow.setActiveVerdict(null);
    flow.setActiveCategory(null);
    flow.setClonesOnly(false);

    if (insight.action.kind === "verdict") flow.setActiveVerdict(insight.action.verdict as Verdict);
    if (insight.action.kind === "project") flow.focusProject(insight.action.path);
    if (insight.action.kind === "category") flow.setActiveCategory(insight.action.category);
    if (insight.action.kind === "duplicates") flow.setClonesOnly(true);
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
          <div className="mb-4 grid gap-4">
            <FilterChips filters={filters} onClear={(dimension) => narrow(dimension, null)} />

            <Summary report={report} />
            <Timeline
              report={report}
              onGrain={(next) => {
                onGrainChange(next);
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
              onShownChange={setShown}
              onShowMore={() => setShown((current) => current + EVENT_PAGE)}
            />
          </div>
        )}

        {/* Above the sentences: the picture is what they are sentences about,
            and it is the answer to "what is on this machine" that the module
            never gave. */}
        <div className="mb-4">
          <Portrait portrait={portrait} onOpenWorkspace={onOpenWorkspace} />
        </div>

        <Highlights insights={insights} projectCount={projects.length} onFollow={follow} />

        {/* Below the highlights because these are the sections that cost
            something to produce — reading every node_modules, running git in
            every repository, walking the tree for what nothing owns. They are
            taken in that order, cheapest first, once the weights have settled. */}
        <div className="mt-8 mb-4 flex items-center justify-between gap-3 border-t border-forest-800 pt-6">
          <div>
            <h2 className="text-sm font-semibold text-mist-100">A closer look</h2>
            <p className="mt-0.5 text-xs text-mist-500">
              {running ? STAGE_COPY[stage!] : "Read from your workspace when it settled."}
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={running || projects.length === 0}
            aria-label={running ? "Reading workspace" : "Read workspace again"}
            className="group inline-flex min-h-8.5 shrink-0 items-center gap-2 rounded-xl bg-sage-400 px-3.5 text-xs font-semibold text-forest-950 shadow-xs transition-all hover:bg-sage-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {running ? (
              <Loader2 size={13} className="animate-spin text-forest-950" aria-hidden="true" />
            ) : (
              <RefreshCw
                size={13}
                className="text-forest-950 transition-transform duration-200 group-hover:rotate-45"
                aria-hidden="true"
              />
            )}
            <span>{running ? "Reading..." : "Read again"}</span>
          </button>
        </div>

        <div className="mt-4 grid gap-4">
          <Duplicates
            report={duplicates.report}
            running={duplicates.running}
            error={duplicates.error}
            proEnabled={proEnabled}
          />

          <Repositories
            report={repositories.report}
            running={repositories.running}
            error={repositories.error}
            // The acting stays on the project page, so this hands the user
            // over rather than growing a second place that deletes branches.
            onOpen={(path) => {
              flow.focusProject(path);
              onOpenWorkspace();
            }}
          />

          <Orphans
            report={orphans.report}
            running={orphans.running}
            error={orphans.error}
            onReveal={(path) => void invoke("reveal_project", { path })}
          />
        </div>
      </div>
    </section>
  );
}
