import { CalendarClock, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import { DEFAULT_POLICY, previewPolicy } from "../utils/maintenance.mjs";
import type { MaintenancePolicy, PolicyPreview, SkipReason } from "../utils/maintenance.d.mts";
import { formatBytes } from "../utils/format";
import { openExternalUrl } from "../utils/externalLink";

const IDLE_CHOICES = [30, 60, 90, 180];

const SKIP_REASONS: Record<SkipReason, string> = {
  verdict: "not safe to automate",
  unmeasured: "not measured yet",
  unknownActivity: "activity could not be read",
  tooRecent: "used recently",
  tooSmall: "below the size floor",
};

/**
 * What a maintenance policy would do, before it is allowed to do it.
 *
 * Preview is the whole feature for now, and deliberately so: the roadmap
 * requires the user to see a selection before granting it a schedule. Nothing
 * on this screen deletes anything, and nothing runs on its own.
 *
 * The selection rules live in `maintenance.mjs`, tested without a window. This
 * file only asks and displays — which matters, because the one thing that must
 * never drift is which projects an unattended run may touch.
 */
export function IntelligenceModule({
  proEnabled,
  onOpenWorkspace,
}: {
  proEnabled: boolean;
  onOpenWorkspace: () => void;
}) {
  const flow = usePurgeFlow();
  const [policy, setPolicy] = useState<MaintenancePolicy>(DEFAULT_POLICY);
  const projects = flow.index.index?.projects ?? [];

  const preview = useMemo(
    () =>
      previewPolicy({
        projects,
        verdicts: flow.verdicts,
        footprints: flow.footprints,
        policy,
      }) as PolicyPreview,
    [projects, flow.verdicts, flow.footprints, policy],
  );

  const skippedReasons = useMemo(() => {
    const counts = new Map<SkipReason, number>();
    for (const entry of preview.skipped) counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [preview.skipped]);

  return (
    <section aria-label="Maintenance" className="flex h-full w-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-forest-800 pb-4">
        <h1 className="text-2xl font-semibold tracking-[-0.045em] text-mist-100">Maintenance</h1>
        <p className="mt-1.5 text-sm text-mist-500">
          A policy chooses which projects a run may reclaim. Nothing runs on its own yet — this shows
          what it would select today.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pt-5 pb-6 [scrollbar-gutter:stable]">
        {!proEnabled && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pro-200/30 bg-pro-surface px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-mist-100">Maintenance is part of Pro</p>
              <p className="mt-1 text-xs leading-5 text-mist-500">
                Set the policy here, and Pro shows what it selects across your workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openExternalUrl("https://uncached.app/pro")}
              className="shrink-0 rounded-xl bg-pro-200 px-3 py-2 text-xs font-semibold text-forest-950 transition-colors hover:bg-pro-100"
            >
              Get Uncached Pro
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">Policy</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-mist-300">Untouched for at least</span>
            {IDLE_CHOICES.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setPolicy({ ...policy, minIdleDays: days })}
                className={`rounded-lg px-2.5 py-1.5 font-mono text-xs transition-colors ${
                  policy.minIdleDays === days
                    ? "bg-forest-800 text-mist-100"
                    : "text-mist-500 hover:bg-forest-850 hover:text-mist-300"
                }`}
              >
                {days}d
              </button>
            ))}
          </div>

          {/* Not a setting, and said out loud for that reason. A policy that
              could be widened to `protect` would be a policy that can lose
              work while nobody is watching. */}
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-mist-500">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-sage-300" aria-hidden="true" />
            Only projects whose work is fully on a remote are ever eligible, and everything moves to
            the Recycle Bin. Neither is configurable.
          </p>
        </div>

        {proEnabled && (
          <div className="mt-4 rounded-2xl border border-forest-800 bg-forest-900 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-mist-100">
                {preview.selected.length === 0
                  ? "This policy selects nothing today"
                  : `Would reclaim ${formatBytes(preview.bytes)} from ${preview.selected.length} ${preview.selected.length === 1 ? "project" : "projects"}`}
              </p>
              {preview.selected.length > 0 && (
                <span className="font-mono text-[11px] text-mist-500">Recycle Bin</span>
              )}
            </div>

            {preview.selected.length > 0 && (
              <ul className="mt-4 divide-y divide-forest-800 overflow-hidden rounded-xl border border-forest-800">
                {preview.selected.map((entry) => (
                  <li
                    key={entry.project.path}
                    className="flex items-center justify-between gap-4 px-3.5 py-2.5"
                  >
                    <span className="min-w-0 truncate text-sm text-mist-100">{entry.project.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-mist-500">
                      idle {entry.idleDays}d · {formatBytes(entry.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* A policy quietly matching nothing is indistinguishable from a
                broken one, so the exclusions are counted rather than dropped. */}
            {skippedReasons.length > 0 && (
              <p className="mt-4 text-xs leading-5 text-mist-500">
                {skippedReasons
                  .map(([reason, count]) => `${count} ${SKIP_REASONS[reason]}`)
                  .join(" · ")}
              </p>
            )}

            {preview.protectedCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  flow.setActiveVerdict("protect");
                  onOpenWorkspace();
                }}
                className="mt-3 text-xs font-medium text-coral-300 transition-colors hover:underline"
              >
                {preview.protectedCount === 1
                  ? "1 project holds work that exists only on this disk"
                  : `${preview.protectedCount} projects hold work that exists only on this disk`}
              </button>
            )}
          </div>
        )}

        <p className="mt-4 flex items-start gap-2 px-1 text-xs leading-5 text-mist-500">
          <CalendarClock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Running this on a schedule comes after the selection can be trusted. Until then the policy
          only reports.
        </p>
      </div>
    </section>
  );
}
