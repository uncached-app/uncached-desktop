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
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-mist-100">
            <GitBranch size={15} className="text-mist-500" aria-hidden="true" />
            Repository hygiene
          </h2>
          <p className="mt-0.5 text-xs text-mist-500">
            {report
              ? `${report.examined} ${report.examined === 1 ? "repository" : "repositories"} read.`
              : "Dead branches, forgotten stashes and worktrees whose folder is gone. Offline; nothing is fetched."}
          </p>
        </div>

        {running && (
          <span className="inline-flex shrink-0 items-center gap-2 text-xs text-mist-500">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            Reading
          </span>
        )}
      </div>

      {error && <p className="mt-3 font-mono text-[11px] leading-5 text-coral-300">{error}</p>}

      {report && (
        <>
          <p className="mt-4 text-sm font-semibold text-mist-100">
            {report.repositories.length > 0 ? (
              <>
                <span className="font-mono text-sage-300">{report.repositories.length}</span>{" "}
                {report.repositories.length === 1 ? "repository is" : "repositories are"} carrying
                something
              </>
            ) : (
              "Every repository here is clean"
            )}
          </p>

          {report.repositories.length > 0 && (
            <>
              <ul className="mt-3 divide-y divide-forest-800">
                {report.repositories.map((repository) => (
                  <li key={repository.path}>
                    <button
                      type="button"
                      onClick={() => onOpen(repository.path)}
                      className="group flex w-full items-center justify-between gap-4 py-2.5 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-mist-100 group-hover:text-sage-300">
                        {repository.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-mist-500">
                        {/* Only what this repository actually has. A row of
                            zeroes reads as a table; three counts read as a
                            sentence. */}
                        {repository.hygiene.deadBranches.length > 0 && (
                          <Count
                            icon={Scissors}
                            value={repository.hygiene.deadBranches.length}
                            label="dead"
                            /* Prunable is the half with a button behind it. */
                            accent={repository.prunable > 0}
                          />
                        )}
                        {repository.hygiene.stashes.length > 0 && (
                          <Count
                            icon={Archive}
                            value={repository.hygiene.stashes.length}
                            label="stashed"
                          />
                        )}
                        {repository.hygiene.worktrees.length > 0 && (
                          <Count
                            icon={TreeDeciduous}
                            value={repository.hygiene.worktrees.length}
                            label="worktrees"
                          />
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <p className="mt-3 border-t border-forest-800 pt-3 text-[11px] leading-5 text-mist-500">
                {report.prunable > 0 ? (
                  <>
                    <span className="font-semibold text-mist-300">
                      {report.prunable} of {report.deadBranches}
                    </span>{" "}
                    dead {report.deadBranches === 1 ? "branch" : "branches"} could be deleted; the
                    rest hold commits reachable from nowhere else. Open a repository to prune it —
                    deleting happens one at a time, where you can read what goes.
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

function Count({
  icon: Icon,
  value,
  label,
  accent = false,
}: {
  icon: typeof Scissors;
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${accent ? "text-sage-300" : ""}`}
      title={`${value} ${label}`}
    >
      <Icon size={12} aria-hidden="true" />
      {value}
    </span>
  );
}
