import { Folder, FolderGit2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProjectRow } from "./ProjectRow";
import { formatBytes } from "../../../utils/format.mjs";
import type { Footprint, RunningProject, Verdict, WorkspaceProject } from "../../../types/workspace";

/**
 * The projects that share a directory, under that directory's name.
 *
 * The reading the list did not have. Sorted by verdict or by size, four folders
 * under one `uncached-app` land in four different places on the screen — the
 * index knew they were siblings and no view said so. Here they are one block,
 * and the heading says whether a tool declares them a workspace or somebody
 * simply filed them together.
 *
 * Projects standing alone are one block at the end. They are not a group, and
 * naming them as one would be a group of things whose only shared property is
 * not belonging to any.
 */
export function FamilyGroup({
  id,
  name,
  detail,
  declared,
  projects,
  verdicts,
  footprints,
  running,
  showRoot,
  focusPath,
  onOpenProject,
  onContextMenu,
  onFolderMenu,
}: {
  id: string;
  name: string;
  detail: string;
  /** A tool calls this a workspace, rather than it only being one directory. */
  declared: boolean;
  projects: WorkspaceProject[];
  verdicts: Record<string, Verdict>;
  footprints: Record<string, Footprint>;
  /** The projects something is working inside, by path. */
  running: Record<string, RunningProject>;
  showRoot: boolean;
  focusPath: string | null;
  onOpenProject: (path: string) => void;
  onContextMenu: (project: WorkspaceProject, event: React.MouseEvent) => void;
  /**
   * The heading's own verbs, or absent when the heading is not a directory.
   *
   * "On their own" is a group this screen invented, not a folder anybody can
   * open — so it gets no menu rather than one that would have to fail.
   */
  onFolderMenu?: (event: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const reclaimable = projects.reduce(
    (sum, project) => sum + (footprints[project.path]?.reclaimableBytes ?? 0),
    0,
  );
  const Icon = declared ? FolderGit2 : Folder;

  return (
    <section aria-labelledby={`family-${id}`} className="pb-5">
      <div
        onContextMenu={onFolderMenu}
        className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-x-2.5 rounded-t-none rounded-b-xl bg-forest-950/90 px-2.5 py-2 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            size={13}
            className={declared ? "shrink-0 text-sage-300" : "shrink-0 text-mist-500"}
            aria-hidden="true"
          />
          {onFolderMenu ? (
            <h2 id={`family-${id}`} className="min-w-0 truncate text-xs font-semibold text-mist-100">
              <button
                type="button"
                onClick={onFolderMenu}
                aria-haspopup="menu"
                className="cursor-pointer rounded-md px-1 py-0.5 transition-colors hover:bg-forest-850 hover:text-sage-300"
              >
                {name}
              </button>
            </h2>
          ) : (
            <h2 id={`family-${id}`} className="min-w-0 truncate text-xs font-semibold text-mist-100">
              {name}
            </h2>
          )}
          <span className="shrink-0 rounded-md bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] font-medium text-mist-300">
            {projects.length}
          </span>
          <span className="hidden truncate text-xs text-mist-500 sm:inline-block">· {detail}</span>
        </div>

        {reclaimable > 0 && (
          <span className="shrink-0 rounded-md border border-forest-800 bg-forest-900 px-2 py-0.5 font-mono text-[11px] font-medium text-sage-300">
            {t("workspace.list.reclaimable", { size: formatBytes(reclaimable) })}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-forest-800 bg-forest-900 shadow-xs">
        {projects.map((project, position) => (
          <ProjectRow
            key={project.path}
            project={project}
            verdict={verdicts[project.path] ?? "unknown"}
            footprint={footprints[project.path] ?? null}
            running={running[project.path] ?? null}
            first={position === 0}
            showRoot={showRoot}
            // Nothing else says it here: the heading is a directory, not a
            // verdict, and a row offering a reclaim without saying whether the
            // project holds work that exists nowhere else is the one row this
            // product must never render.
            showVerdict
            focused={project.path === focusPath}
            onOpen={onOpenProject}
            onContextMenu={(event) => onContextMenu(project, event)}
          />
        ))}
      </div>
    </section>
  );
}
