import { useState } from "react";
import { ArtifactList } from "./project/ArtifactList";
import { ActivityPanel, GitPanel } from "./project/ContextPanels";
import { DuplicatePanel } from "./project/DuplicatePanel";
import { ProjectActions } from "./project/ProjectActions";
import { ProjectHeader } from "./project/ProjectHeader";
import { VerdictPanel } from "./project/VerdictPanel";
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
 * The list has room for a name, a sentence and a size, which is the right
 * amount for triage and the wrong amount for a decision. This is where the
 * evidence behind the verdict is spelled out instead of summarised — what is
 * unpushed, what was stashed, which artifacts make up the weight, and what
 * removing each one costs.
 *
 * This file is the arrangement and nothing else. Each section owns its own
 * state: the artifact list holds its confirmation, the action row reports its
 * own failures. Nothing here needs to know how any of them work.
 */
export function ProjectPage({
  project,
  verdict,
  footprint,
  targets,
  cleaningTargetIds,
  cleanMode,
  onClean,
  onBack,
  onShowInList,
  onOpenProject,
}: ProjectPageProps) {
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <section aria-label={project.name} className="flex h-full w-full flex-1 flex-col overflow-hidden">
      <ProjectHeader project={project} verdict={verdict} footprint={footprint} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto pt-5 pb-6 [scrollbar-gutter:stable]">
        <ProjectActions project={project} onShowInList={onShowInList} onResult={setFlash} />
        {flash && <p className="mt-2 font-mono text-[10px] text-sage-300">{flash}</p>}

        <div className="mt-5 grid gap-4">
          <VerdictPanel project={project} verdict={verdict} footprint={footprint} />

          <div className="grid gap-4 lg:grid-cols-2">
            <GitPanel git={project.git} />
            <ActivityPanel activity={project.activity} />
          </div>

          {project.duplicateOf.length > 0 && (
            <DuplicatePanel paths={project.duplicateOf} onOpen={onOpenProject} />
          )}

          <ArtifactList
            projectPath={project.path}
            targets={targets}
            cleanMode={cleanMode}
            cleaningTargetIds={cleaningTargetIds}
            onClean={onClean}
          />
        </div>
      </div>
    </section>
  );
}
