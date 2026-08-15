import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StatCard } from "../components/shared/StatCard";
import { formatBytes } from "../utils/format";
import { PolicyCard } from "./maintenance/PolicyCard";
import { Selection, type RunState } from "./maintenance/Selection";
import {
  IndexFailed,
  Measuring,
  NoFoldersChosen,
  NoProjects,
  ProPanel,
  ReadingFolders,
} from "./maintenance/states";
import { ScheduleCard } from "./maintenance/ScheduleCard";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import { useMaintenancePreview } from "../hooks/useMaintenancePreview";
import { useScheduleStatus } from "../hooks/useScheduleStatus";
import type { MaintenancePolicy, Schedule } from "../types/maintenance";

/**
 * What a maintenance policy would do, and — on Pro — doing it.
 *
 * The selection rule lives in `src-tauri/src/workspace/maintenance.rs`, tested
 * without a window, and this screen never re-derives it: which projects an
 * unattended run may touch is a decision about what can be deleted, and those
 * belong to the native layer. The run itself goes through `clean_target`, the
 * same command a person clicking a row uses, so every check that applies there
 * applies here.
 *
 * The schedule is a switch, not an engine. What acts on it is a thread in
 * `src-tauri/src/scheduler.rs` that outlives this window and runs whether or not
 * it was ever opened — which is why this screen reports where the schedule
 * stands rather than tracking it.
 */
export function IntelligenceModule({
  proEnabled,
  policy,
  onPolicyChange,
  schedule,
  onScheduleChange,
  onOpenWorkspace,
}: {
  proEnabled: boolean;
  policy: MaintenancePolicy;
  onPolicyChange: (policy: MaintenancePolicy) => void;
  /** The stored schedule, which is what the switch and the chips render from. */
  schedule: Schedule;
  /** Resolves once the write has landed, so a refresh after it reads the new value. */
  onScheduleChange: (schedule: Schedule) => Promise<void>;
  onOpenWorkspace: () => void;
}) {
  const flow = usePurgeFlow();
  const projects = flow.index.index?.projects ?? [];
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const { status: scheduleStatus, refresh: refreshSchedule } = useScheduleStatus(proEnabled);

  // A result describes the selection it was run against. Change the policy and
  // it is describing something else, so it goes rather than sits there being
  // read as the outcome of the numbers now on screen.
  useEffect(() => setRun({ kind: "idle" }), [policy]);

  const { preview, candidates, settling, measured } = useMaintenancePreview({
    projects,
    footprints: flow.footprints,
    verdicts: flow.verdicts,
    measuring: flow.measuring,
    policy,
  });

  // Targets are registered by a scan and only exist while its session does.
  const canRun = flow.targets.length > 0;

  // The workspace list renders on step 3 and nowhere else, so anywhere else the
  // filter would be set on a screen that cannot show it.
  const showProtected =
    flow.step === 3 && flow.index.index
      ? () => {
        flow.setView("projects");
        flow.setActiveVerdict("protect");
        onOpenWorkspace();
      }
      : null;

  async function runNow() {
    setRun({ kind: "running", done: 0, total: 0 });
    try {
      // Asked for rather than sent: the interface says which policy, never
      // which projects, and never which paths.
      const ids = await invoke<string[]>("maintenance_targets", { candidates, policy });
      if (ids.length === 0) {
        setRun({ kind: "done", removed: 0, freedBytes: 0, failed: 0 });
        return;
      }

      let removed = 0;
      let freedBytes = 0;
      let failed = 0;
      for (const [index, id] of ids.entries()) {
        setRun({ kind: "running", done: index + 1, total: ids.length });
        // Trash regardless of the user's default mode: they reviewed a
        // selection described as reversible, and a policy is never permanent.
        const result = await flow.cleanTarget(id, null, "Trash");
        if (result) {
          removed += 1;
          freedBytes += result.freedBytes;
        } else {
          failed += 1;
        }
      }

      // The rows are gone; the weights are not, so each project is read again
      // rather than left claiming what it no longer holds.
      for (const entry of preview.selected) await flow.remeasureProject(entry.path);
      setRun({ kind: "done", removed, freedBytes, failed });
    } catch (runError) {
      setRun({
        kind: "failed",
        message: runError instanceof Error ? runError.message : String(runError),
      });
    }
  }

  return (
    <section aria-label="Maintenance" className="flex h-full w-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-forest-800 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-mist-100 sm:text-3xl">Maintenance</h1>
              <span className="rounded-lg border border-forest-800 bg-forest-900 px-2.5 py-0.5 font-mono text-xs font-semibold text-sage-300">
                {proEnabled ? "Rules & Actions" : "Policy Preview"}
              </span>
            </div>
            <p className="mt-1 text-xs text-mist-500">
              Automate hygiene on stale projects without risking uncommitted or local work.
            </p>
          </div>

          {/* The same figures the workspace header states, drawn the same
              way. These were a third shape — value stacked over an uppercase
              label, right-aligned — that appears on no other screen. */}
          <div className="flex flex-wrap items-center gap-2">
            <StatCard
              value={`${preview.selected.length}`}
              label={preview.selected.length === 1 ? "project eligible" : "projects eligible"}
            />
            <StatCard
              value={formatBytes(preview.bytes)}
              label="reclaimable"
              accent={preview.bytes > 0}
            />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pr-2 pt-5 pb-8 scrollbar-gutter-stable">
        <div className="grid gap-4">
          {!proEnabled && <ProPanel />}

          <PolicyCard
            policy={policy}
            onChange={onPolicyChange}
            matchCount={preview.selected.length}
            matchBytes={preview.bytes}
          />

          {/* Pro only, and absent rather than disabled: a switch that cannot be
              flipped is a control with no operation behind it. */}
          {proEnabled && (
            <ScheduleCard
              schedule={schedule}
              status={scheduleStatus}
              onChange={async (next) => {
                // Awaited. `maintenance_schedule_status` reads settings.json,
                // so refreshing before the write lands returns the previous
                // schedule and puts the switch back where it was — which is
                // what made the toggle and the interval chips look broken.
                await onScheduleChange(next);
                void refreshSchedule();
              }}
            />
          )}

          <PolicyResult
            error={flow.index.error}
            indexed={flow.index.index !== null}
            roots={flow.extraRoots.length}
            projectCount={projects.length}
            settling={settling}
            measured={measured}
            onChooseFolder={onOpenWorkspace}
          >
            <Selection
              preview={preview}
              proEnabled={proEnabled}
              canRun={canRun}
              settling={settling}
              run={run}
              onRun={runNow}
              onShowProtected={showProtected}
            />
          </PolicyResult>

          {/* Where the schedule actually lives, said once. It is a thread in
              this process rather than a system service, so closing to the menu
              bar keeps it and Quit ends it. That is the intended bargain, not a
              gap: something that deleted files on a timer after being told to
              quit would be a different product. The card above says the rest,
              and says it louder when the two settings disagree. */}
          <p className="flex items-start gap-2 px-1 text-xs leading-5 text-mist-500">
            <CalendarClock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            The schedule runs inside Uncached, so closing to the menu bar keeps it going and Quit
            stops it. It picks up any run it missed the next time the app opens.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * The selection, or the reason there is not one yet.
 */
function PolicyResult({
  error,
  indexed,
  roots,
  projectCount,
  settling,
  measured,
  onChooseFolder,
  children,
}: {
  error: string | null;
  /** An index has actually been produced, rather than merely asked for. */
  indexed: boolean;
  roots: number;
  projectCount: number;
  settling: boolean;
  measured: number;
  onChooseFolder: () => void;
  children: React.ReactNode;
}) {
  if (error) return <IndexFailed message={error} />;
  if (roots === 0) return <NoFoldersChosen onChoose={onChooseFolder} />;
  if (!indexed) return <ReadingFolders />;
  if (projectCount === 0) return <NoProjects roots={roots} />;
  // Only show the blocking measuring splash when starting with 0 measured projects
  if (settling && measured === 0) return <Measuring measured={measured} total={projectCount} />;
  return <>{children}</>;
}
