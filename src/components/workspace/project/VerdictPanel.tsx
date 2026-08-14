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
    <Panel title="Verdict">
      <p className="text-sm text-mist-100">{presentation.summary}</p>
      <p className="mt-1 text-xs text-mist-500">{projectEvidence(project, verdict, footprint)}</p>

      {/* Named one by one rather than counted. "Work that exists only on this
          disk" is the sentence; these are the things. */}
      {atRisk.length > 0 && (
        <ul className="mt-3 grid gap-1.5 border-t border-forest-800 pt-3">
          {atRisk.map((line) => (
            <li key={line} className="flex items-center gap-2 text-xs text-coral-300">
              <span className="size-1 shrink-0 rounded-full bg-coral-300" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      )}

      {/* Git is happy to push into the folder next door, and calls the result a
          remote. It is a backup, not somewhere else. */}
      {project.git.remoteIsLocal && (
        <p className="mt-3 border-t border-forest-800 pt-3 text-xs text-coral-300">
          The only remote is a folder on this machine. One disk failure takes the working copy and the
          backup together, so nothing here counts as being on a remote.
        </p>
      )}

      {(project.installMissing || project.installStale) && (
        <p className="mt-3 border-t border-forest-800 pt-3 text-xs text-mist-300">
          {project.installMissing
            ? "There is a lockfile with nothing installed behind it."
            : "The lockfile changed after the last install, so what is installed is already wrong."}
        </p>
      )}
    </Panel>
  );
}

/** Everything that exists nowhere else, named individually. */
function riskLines(recoverability: Recoverability): string[] {
  const lines: Array<[number, string, string]> = [
    [recoverability.unpushedCommits, "commit", "never pushed"],
    [recoverability.stashEntries, "stash", "saved and not applied"],
    [recoverability.branchesWithoutUpstream, "branch", "with no remote"],
    [recoverability.untrackedFiles, "file", "never committed"],
  ];
  return lines
    .filter(([count]) => count > 0)
    .map(([count, noun, suffix]) => `${count} ${count === 1 ? noun : `${noun}s`} ${suffix}`);
}
