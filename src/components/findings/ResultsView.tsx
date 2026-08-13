import { Boxes, FolderTree, RefreshCw } from "lucide-react";
import type { Step } from "../../types/scan";

type ResultsViewProps = {
  step: Step;
  view: "projects" | "artifacts";
  onViewChange: (view: "projects" | "artifacts") => void;
  projectCount: number;
  targetCount: number;
  indexing: boolean;
};

/** Switches between the two readings of one scan. */
export function ResultsView({ step, view, onViewChange, projectCount, targetCount, indexing }: ResultsViewProps) {
  if (step !== 3) return null;

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg bg-forest-900 p-1" role="tablist" aria-label="Results view">
      <Tab active={view === "projects"} onClick={() => onViewChange("projects")}>
        <FolderTree size={13} aria-hidden="true" />
        Projects
        <span className="font-mono text-[10px] opacity-70">{indexing ? "..." : projectCount}</span>
        {indexing && <RefreshCw size={10} className="animate-spin" aria-hidden="true" />}
      </Tab>
      <Tab active={view === "artifacts"} onClick={() => onViewChange("artifacts")}>
        <Boxes size={13} aria-hidden="true" />
        Artifacts
        <span className="font-mono text-[10px] opacity-70">{targetCount}</span>
      </Tab>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-forest-800 text-mist-100" : "text-mist-500 hover:text-mist-300"
      }`}
    >
      {children}
    </button>
  );
}
