import { ProjectRow } from "./ProjectRow";
import { formatBytes } from "../../../utils/format";
import { VERDICT_PRESENTATION } from "../verdictPresentation";
import type { Footprint, Verdict, WorkspaceProject } from "../../../types/workspace";

/** The projects that share a verdict, under a heading that stays in view. */
export function VerdictGroup({
  verdict,
  projects,
  footprints,
  showRoot,
  focusPath,
  onOpenProject,
}: {
  verdict: Verdict;
  projects: WorkspaceProject[];
  footprints: Record<string, Footprint>;
  showRoot: boolean;
  focusPath: string | null;
  onOpenProject: (path: string) => void;
}) {
  const presentation = VERDICT_PRESENTATION[verdict];
  const reclaimable = projects.reduce(
    (sum, project) => sum + (footprints[project.path]?.reclaimableBytes ?? 0),
    0,
  );

  return (
    <section aria-labelledby={`verdict-${verdict}`} className="pb-5">
      {/* Sticky, because a verdict the user has scrolled into is the one piece
          of context every row below it depends on. */}
      <div className="sticky top-0 z-10 flex items-center gap-x-2.5 bg-forest-950 py-2">
        <span className={`size-1.5 shrink-0 rounded-full ${presentation.dotClassName}`} aria-hidden="true" />
        <h2 id={`verdict-${verdict}`} className="shrink-0 text-xs font-semibold text-mist-100">
          {presentation.label}
        </h2>
        <span className="shrink-0 font-mono text-[10px] text-mist-500">{projects.length}</span>
        <p className="min-w-0 flex-1 truncate text-xs text-mist-500">{presentation.summary}</p>
        {reclaimable > 0 && (
          <span className="shrink-0 font-mono text-[11px] text-mist-500">
            {formatBytes(reclaimable)} reclaimable
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-forest-800 bg-forest-900">
        {projects.map((project, position) => (
          <ProjectRow
            key={project.path}
            project={project}
            verdict={verdict}
            footprint={footprints[project.path] ?? null}
            first={position === 0}
            showRoot={showRoot}
            focused={project.path === focusPath}
            onOpen={onOpenProject}
          />
        ))}
      </div>
    </section>
  );
}
