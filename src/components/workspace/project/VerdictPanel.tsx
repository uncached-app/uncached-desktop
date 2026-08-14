import { HardDrive, Info } from "lucide-react";
import { Panel } from "./panels";
import { VERDICT_PRESENTATION, projectEvidence } from "../verdictPresentation";
import type { Footprint, Recoverability, Verdict, WorkspaceProject } from "../../../types/workspace";

/**
 * The verdict, with its reasons rather than its summary.
 *
 * The list says "holds work that exists only on this disk". This says which
 * work. That difference is the reason the page exists: a sentence is enough to
 * triage and never enough to decide.
 */
export function VerdictPanel({
  project,
  verdict,
  footprint,
}: {
  project: WorkspaceProject;
  verdict: Verdict;
  footprint: Footprint | null;
}) {
  const presentation = VERDICT_PRESENTATION[verdict];
  const atRisk = riskLines(project.git.recoverability);

  return (
    <Panel
      title="Verdict Analysis"
      action={
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${presentation.className}`}>
          <span className={`size-1.5 rounded-full ${presentation.dotClassName}`} aria-hidden="true" />
          {presentation.label}
        </span>
      }
    >
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-mist-100">{presentation.summary}</p>
          <p className="mt-0.5 text-xs text-mist-500">{projectEvidence(project, verdict, footprint)}</p>
        </div>

        {/* Risk & Safety status */}
        {atRisk.length > 0 && (
          <div className="border-t border-forest-800 pt-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-coral-300">
              Uncommitted or unpushed local work
            </p>
            <ul className="mt-1.5 space-y-1">
              {atRisk.map((line) => (
                <li key={line} className="flex items-center gap-2 text-xs text-coral-300">
                  <span className="size-1.5 shrink-0 rounded-full bg-coral-300" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Local remote warning */}
        {project.git.remoteIsLocal && (
          <div className="flex items-start gap-2 border-t border-forest-800 pt-2.5 text-xs text-coral-300">
            <HardDrive size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">
              <strong>Local backup:</strong> The git remote is a local folder on this machine rather than a remote server.
            </p>
          </div>
        )}

        {/* Lockfile / Dependencies warnings */}
        {(project.installMissing || project.installStale) && (
          <div className="flex items-start gap-2 border-t border-forest-800 pt-2.5 text-xs text-confidence-medium">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">
              {project.installMissing
                ? "Lockfile present with missing dependencies. Run package manager install before testing."
                : "Lockfile changed after last install. Installed dependencies may be stale."}
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Everything that exists nowhere else, named individually. */
function riskLines(recoverability: Recoverability): string[] {
  const lines: Array<[number, string, string]> = [
    [recoverability.unpushedCommits, "commit", "never pushed"],
    [recoverability.stashEntries, "stash", "saved and unapplied"],
    [recoverability.branchesWithoutUpstream, "branch", "without remote upstream"],
    [recoverability.untrackedFiles, "file", "never committed"],
  ];
  return lines
    .filter(([count]) => count > 0)
    .map(([count, noun, suffix]) => `${count} ${count === 1 ? noun : `${noun}s`} ${suffix}`);
}
