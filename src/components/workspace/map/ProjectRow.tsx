import { Copy, GitBranch } from "lucide-react";
import { motion } from "motion/react";
import { rootName } from "./naming";
import { formatBytes } from "../../../utils/format";
import { projectEvidence } from "../verdictPresentation";
import type { Footprint, Verdict, WorkspaceProject } from "../../../types/workspace";

/** One project: who it is, what the verdict rests on, and what it weighs. */
export function ProjectRow({
  project,
  verdict,
  footprint,
  first,
  showRoot,
  focused,
  onOpen,
}: {
  project: WorkspaceProject;
  verdict: Verdict;
  footprint: Footprint | null;
  first: boolean;
  showRoot: boolean;
  focused: boolean;
  onOpen: (path: string) => void;
}) {
  const evidence = projectEvidence(project, verdict, footprint);
  const share = footprint && footprint.totalBytes > 0 ? footprint.reclaimableBytes / footprint.totalBytes : 0;

  return (
    // A button rather than an article with a click handler: the row is the way
    // into everything you can do with a project, and a real button carries the
    // keyboard and the focus ring without either being reimplemented here.
    <motion.button
      type="button"
      data-path={project.path}
      onClick={() => onOpen(project.path)}
      title={`${project.name} — everything known about it`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-forest-850 ${
        first ? "" : "border-t border-forest-800"
      } ${focused ? "bg-forest-850 ring-1 ring-inset ring-sage-400" : ""}`}
    >
      {/* Line one is identity, line two is the finding. Both keep their own row
          of the grid so the size column lines up across every group. */}
      <div className="col-start-1 flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-mist-100">{project.name}</span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
          {project.kind}
        </span>
        {project.git.branch && (
          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-mist-500">
            <GitBranch size={10} aria-hidden="true" />
            {project.git.branch}
          </span>
        )}
        {showRoot && (
          <span className="shrink-0 truncate font-mono text-[10px] text-mist-500">{rootName(project.root)}</span>
        )}
        {project.duplicateOf.length > 0 && (
          <span
            title={project.duplicateOf.join("\n")}
            className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-mist-500"
          >
            <Copy size={9} aria-hidden="true" />
            {project.duplicateOf.length === 1 ? "1 copy" : `${project.duplicateOf.length} copies`}
          </span>
        )}
      </div>

      {/* The sentence is the product: it says what no file manager can. */}
      <p className="col-start-1 row-start-2 truncate text-xs text-mist-500">{evidence}</p>

      {/* Two measurements, one under the other on the row's own two lines: what
          the project weighs, and how much of that weight is regenerable. The bar
          reads as the share only because the number it belongs to sits beside
          it — on its own it looked like a fill gauge. */}
      <div className="col-start-2 row-span-2 row-start-1 flex items-center gap-3">
        {footprint ? (
          <span className="w-48">
            <span className="flex items-baseline justify-end gap-1.5">
              <span className="font-mono text-xs text-mist-100">{formatBytes(footprint.totalBytes)}</span>
              <span className="text-[10px] text-mist-500">on disk</span>
            </span>
            <span className="mt-1.5 flex items-center justify-end gap-2">
              {footprint.reclaimableBytes > 0 ? (
                <>
                  <span
                    className="block h-1 w-10 shrink-0 overflow-hidden rounded-full bg-forest-800"
                    aria-hidden="true"
                  >
                    <span className="block h-full rounded-full bg-sage-400" style={{ width: `${share * 100}%` }} />
                  </span>
                  <span className="font-mono text-[11px] text-sage-300">
                    {formatBytes(footprint.reclaimableBytes)}
                  </span>
                  <span className="text-[10px] text-mist-500">reclaimable</span>
                </>
              ) : (
                <span className="text-[11px] font-medium text-sage-300">Nothing to reclaim</span>
              )}
            </span>
          </span>
        ) : (
          <span className="w-48 text-right font-mono text-[10px] text-mist-500/60">measuring...</span>
        )}
      </div>
    </motion.button>
  );
}
