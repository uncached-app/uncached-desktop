import { Archive, GitBranch, Loader2, Scissors, TreeDeciduous } from "lucide-react";
import type { WorkspaceHygiene } from "../../types/hygiene";

/**
 * Which repositories are carrying something nothing uses.
 *
 * The reading itself is not new — a project's own page has shown it since the
 * hygiene module landed. What was missing is the question this answers: *which*
 * project's page is worth opening. On a workspace of forty repositories that was
 * forty clicks, so the finding existed and effectively nobody could reach it.
 *
 * Nothing here deletes. Pruning stays on the project page, one repository at a
 * time, behind a command that re-reads hygiene before it touches a branch — an
 * aggregate "prune everything" button would be one click between a user and
 * dozens of repositories they had not looked at.
 *
 * Free on every plan, like the panel it summarises: being told a six-month
 * stash exists is not a thing to charge for.
 */
export function Repositories({
  report,
  running,
  error,
  onOpen,
}: {
  report: WorkspaceHygiene | null;
  running: boolean;
  error: string | null;
  onOpen: (path: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-mist-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-mist-100">
            Repository hygiene
          </h2>
        </div>

        {running ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs text-mist-500">
            <Loader2 size={12} className="animate-spin text-sage-300" aria-hidden="true" />
            Reading
          </span>
        ) : report ? (
          <span className="font-mono text-xs text-mist-500">
            {report.examined} {report.examined === 1 ? "repository" : "repositories"}
          </span>
        ) : null}
      </div>

      {error && <p className="mt-3 font-mono text-[11px] leading-5 text-coral-300">{error}</p>}

      {report && (
        <>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-mist-300">
              {report.repositories.length > 0 ? (
                <>
                  <span className="font-mono font-semibold text-sage-300">{report.repositories.length}</span>{" "}
                  {report.repositories.length === 1 ? "repository is" : "repositories are"} carrying unmerged items
                </>
              ) : (
                "Every repository here is clean."
              )}
            </p>
            {report.prunable > 0 && (
              <span className="font-mono text-xs font-medium text-sage-300 shrink-0">
                {report.prunable} prunable
              </span>
            )}
          </div>

          {report.repositories.length > 0 && (
            <>
              <ul className="mt-3 divide-y divide-forest-800">
                {report.repositories.map((repository) => (
                  <li key={repository.path}>
                    <button
                      type="button"
                      onClick={() => onOpen(repository.path)}
                      className="group flex w-full items-center justify-between gap-4 py-2.5 px-1 rounded-lg transition-colors hover:bg-forest-850/30 cursor-pointer text-left"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-mist-100 group-hover:text-sage-300 transition-colors">
                        {repository.name}
                      </span>

                      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-mist-500">
                        {repository.hygiene.deadBranches.length > 0 && (
                          <span
                            className={`inline-flex items-center gap-1 rounded bg-forest-850 px-1.5 py-0.5 text-[10px] ${
                              repository.prunable > 0 ? "text-sage-300 font-medium" : "text-mist-400"
                            }`}
                            title={`${repository.hygiene.deadBranches.length} dead branches`}
                          >
                            <Scissors size={10} aria-hidden="true" />
                            <span>{repository.hygiene.deadBranches.length} dead</span>
                          </span>
                        )}
                        {repository.hygiene.stashes.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1 rounded bg-forest-850 px-1.5 py-0.5 text-[10px] text-mist-400"
                            title={`${repository.hygiene.stashes.length} stashes`}
                          >
                            <Archive size={10} aria-hidden="true" />
                            <span>{repository.hygiene.stashes.length} stashed</span>
                          </span>
                        )}
                        {repository.hygiene.worktrees.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1 rounded bg-forest-850 px-1.5 py-0.5 text-[10px] text-mist-400"
                            title={`${repository.hygiene.worktrees.length} worktrees`}
                          >
                            <TreeDeciduous size={10} aria-hidden="true" />
                            <span>{repository.hygiene.worktrees.length} worktrees</span>
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              <p className="mt-3 border-t border-forest-800 pt-3 text-[11px] leading-relaxed text-mist-500">
                {report.prunable > 0 ? (
                  <>
                    <span className="font-semibold text-mist-300">
                      {report.prunable} of {report.deadBranches}
                    </span>{" "}
                    dead {report.deadBranches === 1 ? "branch" : "branches"} could be deleted; the rest
                    hold commits reachable from nowhere else. Open a repository to prune it.
                  </>
                ) : (
                  <>
                    None of these branches can be deleted safely: their commits are reachable from
                    nowhere else. Stashes and worktrees are reported and never acted on.
                  </>
                )}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
