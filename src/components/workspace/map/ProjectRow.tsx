import { ChevronRight, Copy, GitBranch } from "lucide-react";
import { motion } from "motion/react";
import { rootName } from "./naming";
import { formatBytes } from "../../../utils/format";
import { projectEvidence } from "../verdictPresentation";
import type { Footprint, Verdict, WorkspaceProject } from "../../../types/workspace";

/**
 * What the project weighs, and whether that figure is a total or a floor.
 *
 * `hasErrors` means some directory under it could not be read, so the walk
 * measured part of the project and the sum is the smallest it could be. Printed
 * plain, it would be a number the product states as fact and cannot stand
 * behind — which is the one thing the size column must never be.
 */
function OnDisk({ footprint }: { footprint: Footprint }) {
  return (
    <div className="flex items-baseline gap-1 font-mono text-xs">
      {footprint.hasErrors && (
        <span
          className="text-[10px] font-semibold text-mist-500"
          title="Some folders under this project could not be read, so this is a floor rather than a total."
        >
          &ge;
        </span>
      )}
      <span className="font-semibold text-mist-100">{formatBytes(footprint.totalBytes)}</span>
      <span className="text-[10px] text-mist-500">on disk</span>
    </div>
  );
}

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
  const isAtRisk = verdict === "protect";
  const isSafe = verdict === "safe";

  return (
    // A button rather than an article with a click handler: the row is the way
    // into everything you can do with a project, and a real button carries the
    // keyboard and the focus ring without either being reimplemented here.
    <motion.button
      type="button"
      data-path={project.path}
      onClick={() => onOpen(project.path)}
      aria-label={`${project.name} project details`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-all hover:bg-forest-850/80 ${
        first ? "" : "border-t border-forest-800"
      } ${focused ? "bg-forest-850 ring-1 ring-inset ring-sage-400" : ""}`}
    >
      {/* Left side: Project identity & evidence line */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold tracking-tight text-mist-100">
            {project.name}
          </span>
          <span className="shrink-0 rounded border border-forest-800 bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-mist-300">
            {project.kind}
          </span>
          {project.git.branch && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-forest-800/80 bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
              <GitBranch size={10} className="text-mist-500" aria-hidden="true" />
              <span className="truncate max-w-28">{project.git.branch}</span>
            </span>
          )}
          {showRoot && (
            <span className="shrink-0 truncate font-mono text-[10px] text-mist-500">
              {rootName(project.root)}
            </span>
          )}
          {project.duplicateOf.length > 0 && (
            <span
              title={project.duplicateOf.join("\n")}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-forest-800/80 bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500"
            >
              <Copy size={9} aria-hidden="true" />
              {project.duplicateOf.length === 1 ? "1 copy" : `${project.duplicateOf.length} copies`}
            </span>
          )}
        </div>

        {/* The sentence is the product: what is at stake or on offer */}
        <p
          className={`truncate text-xs ${
            isAtRisk
              ? "font-medium text-coral-300"
              : isSafe
              ? "text-mist-300"
              : "text-mist-500"
          }`}
        >
          {evidence}
        </p>
      </div>

      {/* Right side: On disk size, Reclaimable volume & Chevron */}
      <div className="shrink-0 flex items-center gap-3 text-right">
        <div className="flex flex-col items-end gap-0.5">
          {footprint ? (
            footprint.reclaimableBytes > 0 ? (
              <>
                <OnDisk footprint={footprint} />
                <div className="flex items-center gap-1.5">
                  <div
                    className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-forest-800"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-sage-400 transition-all duration-300"
                      style={{ width: `${Math.max(8, share * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-sage-300">
                    {formatBytes(footprint.reclaimableBytes)}
                  </span>
                  <span className="font-mono text-[10px] text-mist-500">reclaimable</span>
                </div>
              </>
            ) : (
              <OnDisk footprint={footprint} />
            )
          ) : (
            <span className="font-mono text-[10px] text-mist-500">measuring...</span>
          )}
        </div>

        {/* Subtle hover navigation chevron */}
        <div className="pl-0.5 text-mist-500 opacity-25 transition-all group-hover:opacity-100 group-hover:translate-x-0.5">
          <ChevronRight size={15} aria-hidden="true" />
        </div>
      </div>
    </motion.button>
  );
}
