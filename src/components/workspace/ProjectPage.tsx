import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Radio } from "lucide-react";
import { Trans } from "react-i18next";
import { ArtifactList } from "./project/ArtifactList";
import { ActivityPanel, GitPanel } from "./project/ContextPanels";
import { DuplicatePanel } from "./project/DuplicatePanel";
import { SharedPanel } from "./project/SharedPanel";
import { FootprintPanel } from "./project/FootprintPanel";
import { HygienePanel } from "./project/HygienePanel";
import { ProjectActions } from "./project/ProjectActions";
import { ProjectHeader } from "./project/ProjectHeader";
import { VerdictPanel } from "./project/VerdictPanel";
import { useProjectHygiene } from "../../hooks/useProjectHygiene";
import { useFlash } from "../../hooks/useFlash";
import type { ScanTarget } from "../../types/scan";
import type { CleanMode } from "../../types/settings";
import type { DuplicatePackage } from "../../types/duplicates";
import type { Footprint, RunningProject, Verdict, WorkspaceProject } from "../../types/workspace";

type ProjectPageProps = {
  project: WorkspaceProject;
  verdict: Verdict;
  footprint: Footprint | null;
  /** The process working inside this project, when there is one. */
  running: RunningProject | null;
  /** Every artifact the same scan found, unfiltered. */
  targets: ScanTarget[];
  cleaningTargetIds: Set<string>;
  /** The mode the user chose in settings, which decides what a click costs. */
  cleanMode: CleanMode;
  /** Which plan is active, so a target the backend would refuse is not offered. */
  proEnabled: boolean;
  /** Resolves false when the backend refused, so the page can say so. */
  onClean: (targetId: string, confirmation: string | null) => Promise<boolean>;
  onBack: () => void;
  onShowInList: () => void;
  /** Other indexed paths holding the same repository. */
  onOpenProject: (path: string) => void;
  /** The workspace's duplicate reading, narrowed here to this project. */
  packages: DuplicatePackage[];
  /** That reading has not finished, so an empty list means nothing yet. */
  analysing: boolean;
};

/**
 * Everything known about one project, on one screen.
 *
 * Structured as a 2-column dashboard:
 * - Left column: Triage and reclamation actions (Verdict health diagnostics + Artifacts list).
 * - Right column: Context inspector (Quick launchers, Git telemetry, and activity tracking).
 */
export function ProjectPage({
  project,
  verdict,
  footprint,
  running,
  targets,
  cleaningTargetIds,
  cleanMode,
  proEnabled,
  onClean,
  onBack,
  onShowInList,
  onOpenProject,
  packages,
  analysing,
}: ProjectPageProps) {
  const [flash, handleResult] = useFlash();
  const reducedMotion = useReducedMotion();
  // Four Git processes per project, so it is read here — where the user is
  // looking at one repository — rather than during an index of up to 250.
  const hygiene = useProjectHygiene(project.git.branch ? project.path : null);

  return (
    <section aria-label={project.name} className="flex h-full w-full flex-1 flex-col overflow-hidden">
      <ProjectHeader project={project} verdict={verdict} footprint={footprint} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto pe-2 pt-4 pb-8 scrollbar-gutter-stable">
        {/* Horizontal Action Bar & Feedback Toast */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ProjectActions project={project} onShowInList={onShowInList} onResult={handleResult} />

          <AnimatePresence>
            {flash && (
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sage-400/40 bg-sage-400/10 px-3 py-1.5 text-xs font-medium text-sage-300 shadow-xs"
              >
                <CheckCircle2 size={13} className="text-sage-300" aria-hidden="true" />
                <span>{flash}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Clean, un-nested modular panels */}
        <div className="mt-4 grid gap-4">
          {/* First, and above the verdict.

              Everything below this reads a tree that is being written to while
              it is read: the weight is missing because measuring was stopped,
              and every Clean on the page is one the system will refuse for the
              files the process still holds open. Saying that once at the top is
              the honest version of a page that would otherwise offer a dozen
              buttons that cannot work. */}
          {running && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-2xl border border-coral-300/40 bg-coral-surface px-4 py-3 text-sm text-coral-300"
            >
              <Radio size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>
                {running.processes > 1 ? (
                  <Trans
                    i18nKey="workspace.project.running.several"
                    count={running.processes}
                    values={{ command: running.command }}
                    components={{ strong: <span className="font-semibold" /> }}
                  />
                ) : (
                  <Trans
                    i18nKey="workspace.project.running.single"
                    values={{ command: running.command }}
                    components={{ strong: <span className="font-semibold" /> }}
                  />
                )}
              </p>
            </div>
          )}

          <VerdictPanel
            project={project}
            verdict={verdict}
            footprint={footprint}
            onResult={handleResult}
          />

          {/* Above Git and Activity: "why is this so big" is the question the
              page is opened with, and the answer was computed all along. */}
          {footprint && <FootprintPanel footprint={footprint} />}

          <div className="grid gap-4 lg:grid-cols-2">
            <GitPanel git={project.git} />
            <ActivityPanel activity={project.activity} />
          </div>

          {project.git.branch && (
            <HygienePanel
              hygiene={hygiene.hygiene}
              loading={hygiene.loading}
              working={hygiene.working}
              error={hygiene.error}
              fetchedAt={hygiene.fetchedAt}
              lastFetchAt={project.git.lastFetchAt}
              onFetch={hygiene.fetchRemote}
              onPrune={hygiene.prune}
            />
          )}

          {project.duplicateOf.length > 0 && (
            <DuplicatePanel paths={project.duplicateOf} onOpen={onOpenProject} />
          )}

          <SharedPanel packages={packages} running={analysing} />

          <ArtifactList
            projectPath={project.path}
            targets={targets}
            cleanMode={cleanMode}
            proEnabled={proEnabled}
            cleaningTargetIds={cleaningTargetIds}
            onClean={onClean}
          />
        </div>
      </div>
    </section>
  );
}
