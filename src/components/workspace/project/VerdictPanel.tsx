import { HardDrive, Info, RotateCcw } from "lucide-react";
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

        {project.restore && <RestoreLine restore={project.restore} />}
      </div>
    </Panel>
  );
}

/**
 * What putting it back would cost, beside the reason for taking it away.
 *
 * The product's entire justification is that these directories are
 * regenerable, and it has never said how. Stated here rather than on its own
 * card because a benefit and its price belong in one place: this panel is where
 * the reclaim is argued for.
 *
 * The unpinned case is the one worth the colour. `installMissing` and
 * `installStale` both begin by finding a lockfile, so a project holding an
 * install that nothing pins passes every existing check and reads as healthy.
 * Its bytes come back; that exact resolved tree does not.
 */
function RestoreLine({ restore }: { restore: NonNullable<WorkspaceProject["restore"]> }) {
  const pinned = restore.pinnedBy !== null;

  return (
    <div
      className={`flex items-start gap-2 border-t border-forest-800 pt-2.5 text-xs ${
        pinned ? "text-mist-500" : "text-confidence-medium"
      }`}
    >
      <RotateCcw size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="leading-relaxed">
        <strong className="text-mist-300">Restoring:</strong>{" "}
        <code className="rounded bg-forest-850 px-1.5 py-0.5 font-mono text-[11px] text-mist-100">
          {restore.command}
        </code>{" "}
        {pinned ? (
          <>
            — <span className="font-mono">{restore.pinnedBy}</span> fixes which versions come back.
          </>
        ) : (
          <>
            — nothing here pins the versions, so a reinstall resolves current ones. The space
            returns; this exact set of dependencies does not.
          </>
        )}
      </p>
    </div>
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
