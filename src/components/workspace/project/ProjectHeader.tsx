import { ArrowLeft } from "lucide-react";
import { Figure } from "./panels";
import { formatBytes } from "../../../utils/format";
import { VERDICT_PRESENTATION } from "../verdictPresentation";
import type { Footprint, Verdict, WorkspaceProject } from "../../../types/workspace";

/** Who this is, what it weighs, and the way back. */
export function ProjectHeader({
  project,
  verdict,
  footprint,
  onBack,
}: {
  project: WorkspaceProject;
  verdict: Verdict;
  footprint: Footprint | null;
  onBack: () => void;
}) {
  const presentation = VERDICT_PRESENTATION[verdict];

  return (
    <header className="shrink-0 border-b border-forest-800 pb-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-mist-500 transition-colors hover:text-mist-100"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        Workspace
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-mist-100">{project.name}</h1>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
              {project.kind}
            </span>
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${presentation.className}`}>
              {presentation.label}
            </span>
          </div>
          <p className="mt-1.5 truncate font-mono text-[11px] text-mist-500">{project.path}</p>
        </div>

        {footprint && (
          <div className="flex shrink-0 items-baseline gap-5">
            <Figure value={formatBytes(footprint.totalBytes)} label="on disk" />
            <Figure value={formatBytes(footprint.reclaimableBytes)} label="reclaimable" accent />
            {/* What stays once every artifact is gone — the number that says
                whether this project is heavy or its build output is. */}
            <Figure value={formatBytes(footprint.sourceBytes)} label="source" />
          </div>
        )}
      </div>
    </header>
  );
}
