import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { ArtifactList } from "./project/ArtifactList";
import { ActivityPanel, GitPanel } from "./project/ContextPanels";
import { DuplicatePanel } from "./project/DuplicatePanel";
import { FootprintPanel } from "./project/FootprintPanel";
import { HygienePanel } from "./project/HygienePanel";
import { ProjectActions } from "./project/ProjectActions";
import { ProjectHeader } from "./project/ProjectHeader";
import { VerdictPanel } from "./project/VerdictPanel";
import { useProjectHygiene } from "../../hooks/useProjectHygiene";
import type { ScanTarget } from "../../types/scan";
import type { CleanMode } from "../../types/settings";
import type { Footprint, Verdict, WorkspaceProject } from "../../types/workspace";

type ProjectPageProps = {
  project: WorkspaceProject;
  verdict: Verdict;
  footprint: Footprint | null;
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
  targets,
  cleaningTargetIds,
  cleanMode,
  proEnabled,
  onClean,
  onBack,
  onShowInList,
  onOpenProject,
}: ProjectPageProps) {
  const [flash, setFlash] = useState<string | null>(null);
  // Four Git processes per project, so it is read here — where the user is
  // looking at one repository — rather than during an index of up to 250.
  const hygiene = useProjectHygiene(project.git.branch ? project.path : null);

  function handleResult(message: string | null) {
    setFlash(message);
    if (message) {
      setTimeout(() => setFlash((current) => (current === message ? null : current)), 3500);
    }
  }

  return (
    <section aria-label={project.name} className="flex h-full w-full flex-1 flex-col overflow-hidden">
      <ProjectHeader project={project} verdict={verdict} footprint={footprint} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto pr-2 pt-4 pb-8 scrollbar-gutter-stable">
        {/* Horizontal Action Bar & Feedback Toast */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ProjectActions project={project} onShowInList={onShowInList} onResult={handleResult} />

          <AnimatePresence>
            {flash && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
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
          <VerdictPanel project={project} verdict={verdict} footprint={footprint} />

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
