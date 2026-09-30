import { useTranslation } from "react-i18next";
import { ProjectRow } from "./ProjectRow";
import { formatBytes } from "../../../utils/format.mjs";
import { VERDICT_PRESENTATION } from "../verdictPresentation";
import type { Footprint, RunningProject, Verdict, WorkspaceProject } from "../../../types/workspace";

/** The projects that share a verdict, under a heading that stays in view. */
export function VerdictGroup({
  verdict,
  projects,
  footprints,
  running,
  showRoot,
  focusPath,
  onOpenProject,
  onContextMenu,
}: {
  verdict: Verdict;
  projects: WorkspaceProject[];
  footprints: Record<string, Footprint>;
  /** The projects something is working inside, by path. */
  running: Record<string, RunningProject>;
  showRoot: boolean;
  focusPath: string | null;
  onOpenProject: (path: string) => void;
  onContextMenu: (project: WorkspaceProject, event: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const presentation = VERDICT_PRESENTATION[verdict];
  const reclaimable = projects.reduce(
    (sum, project) => sum + (footprints[project.path]?.reclaimableBytes ?? 0),
    0,
  );

  return (
    <section aria-labelledby={`verdict-${verdict}`} className="pb-5">
      {/* Sticky group header with flat top edges */}
      <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-x-2.5 rounded-t-none rounded-b-xl bg-forest-950/90 px-2.5 py-2 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`size-2 shrink-0 rounded-full ${presentation.dotClassName}`} aria-hidden="true" />
          <h2 id={`verdict-${verdict}`} className="shrink-0 text-xs font-semibold text-mist-100">
            {t(presentation.labelKey)}
          </h2>
          <span className="shrink-0 rounded-md bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] font-medium text-mist-300">
            {projects.length}
          </span>
          <span className="hidden sm:inline-block truncate text-xs text-mist-500">· {t(presentation.summaryKey)}</span>
        </div>

        {reclaimable > 0 && (
          <span
            className={`shrink-0 rounded-md bg-forest-900 border border-forest-800 px-2 py-0.5 font-mono text-[11px] font-medium ${
              verdict === "protect" ? "text-mist-300" : "text-sage-300"
            }`}
          >
            {t("workspace.list.reclaimable", { size: formatBytes(reclaimable) })}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-forest-800 bg-forest-900 shadow-xs">
        {projects.map((project, position) => (
          <ProjectRow
            key={project.path}
            project={project}
            verdict={verdict}
            footprint={footprints[project.path] ?? null}
            running={running[project.path] ?? null}
            first={position === 0}
            showRoot={showRoot}
            focused={project.path === focusPath}
            onOpen={onOpenProject}
            onContextMenu={(event) => onContextMenu(project, event)}
          />
        ))}
      </div>
    </section>
  );
}
