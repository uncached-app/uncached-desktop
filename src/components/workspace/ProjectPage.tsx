import { ArrowLeft, Compass, GitBranch, Loader2, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useProjectActions } from "../../hooks/useProjectActions";
import { formatBytes } from "../../utils/format";
import { isInside, relativeTo } from "../../utils/paths.mjs";
import type { ScanTarget } from "../../types/scan";
import type { CleanMode } from "../../types/settings";
import type { Footprint, Recoverability, Verdict, WorkspaceProject } from "../../types/workspace";
import { VERDICT_PRESENTATION, projectEvidence } from "./verdictPresentation";

type ProjectPageProps = {
  project: WorkspaceProject;
  verdict: Verdict;
  footprint: Footprint | null;
  /** Every artifact the same scan found, unfiltered. */
  targets: ScanTarget[];
  cleaningTargetIds: Set<string>;
  /** The mode the user chose in settings, which decides what a click costs. */
  cleanMode: CleanMode;
  /** Resolves false when the backend refused, so the page can say so. */
  onClean: (targetId: string, confirmation: string | null) => Promise<boolean>;
  onBack: () => void;
  onShowInList: () => void;
  /** Other indexed paths holding the same repository. */
  onOpenProject: (path: string) => void;
};

/**
 * Everything known about one project, on one screen.
 *
 * The list has room for a name, a sentence and a size, which is the right
 * amount for triage and the wrong amount for a decision. This is where the
 * evidence behind the verdict is spelled out instead of summarised — what is
 * unpushed, what was stashed, which artifacts make up the weight, and what
 * removing each one costs.
 *
 * It is also the only place a single artifact can be reclaimed. The reclaim
 * flow is for clearing a workspace; this is for the moment someone has decided
 * about one project and wants exactly that.
 */
export function ProjectPage({
  project,
  verdict,
  footprint,
  targets,
  cleaningTargetIds,
  cleanMode,
  onClean,
  onBack,
  onShowInList,
  onOpenProject,
}: ProjectPageProps) {
  const actions = useProjectActions(project);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const presentation = VERDICT_PRESENTATION[verdict];
  // The setting decides what the button does, so it also decides what the
  // button asks for first. Reclaiming here must never be quieter than
  // reclaiming anywhere else.
  const permanent = cleanMode === "Permanent";
  const armed = !permanent || confirmation === "Nuke";

  async function reclaim(targetId: string) {
    const removed = await onClean(targetId, permanent ? confirmation : null);
    if (!removed) setFlash("That could not be reclaimed");
  }

  const owned = useMemo(
    () =>
      targets
        .filter((target) => isInside(target.path, project.path))
        .sort((left, right) => right.sizeBytes - left.sizeBytes),
    [targets, project.path],
  );

  const atRisk = riskLines(project.git.recoverability);

  return (
    <section aria-label={project.name} className="flex h-full w-full flex-1 flex-col overflow-hidden">
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

      <div className="min-h-0 flex-1 overflow-y-auto pt-5 pb-6 [scrollbar-gutter:stable]">
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() =>
                  void action.perform().then(
                    () => setFlash(action.leaves ? null : `${action.title.toLowerCase()} — done`),
                    (error) => setFlash(typeof error === "string" ? error : "That did not work"),
                  )
                }
                className="flex items-center gap-2 rounded-xl border border-forest-800 bg-forest-900 px-3 py-2 text-xs text-mist-300 transition-colors hover:border-sage-400 hover:text-mist-100"
              >
                <Icon size={13} aria-hidden="true" />
                {action.title}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onShowInList}
            className="flex items-center gap-2 rounded-xl border border-forest-800 bg-forest-900 px-3 py-2 text-xs text-mist-300 transition-colors hover:border-sage-400 hover:text-mist-100"
          >
            <Compass size={13} aria-hidden="true" />
            Show in workspace
          </button>
        </div>
        {flash && <p className="mt-2 font-mono text-[10px] text-sage-300">{flash}</p>}

        <div className="mt-5 grid gap-4">
          <Panel title="Verdict">
            <p className="text-sm text-mist-100">{presentation.summary}</p>
            <p className="mt-1 text-xs text-mist-500">{projectEvidence(project, verdict, footprint)}</p>

            {/* Named one by one rather than counted. "Work that exists only on
                this disk" is the sentence; these are the things. */}
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

            {(project.installMissing || project.installStale) && (
              <p className="mt-3 border-t border-forest-800 pt-3 text-xs text-mist-300">
                {project.installMissing
                  ? "There is a lockfile with nothing installed behind it."
                  : "The lockfile changed after the last install, so what is installed is already wrong."}
              </p>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Git">
              {project.git.branch ? (
                <dl className="grid gap-2 text-xs">
                  <Field label="Branch">
                    <span className="inline-flex items-center gap-1.5 font-mono text-mist-100">
                      <GitBranch size={11} aria-hidden="true" />
                      {project.git.branch}
                      {project.git.dirty && <span className="text-confidence-review">uncommitted changes</span>}
                    </span>
                  </Field>
                  <Field label="Remote">
                    <span className="truncate font-mono text-mist-300">{project.git.remote ?? "none"}</span>
                  </Field>
                  {project.git.lastCommitSummary && (
                    <Field label="Last commit">
                      <span className="min-w-0">
                        <span className="block truncate text-mist-100">{project.git.lastCommitSummary}</span>
                        {project.git.lastCommitAt && (
                          <span className="font-mono text-[10px] text-mist-500">
                            {new Date(project.git.lastCommitAt * 1000).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    </Field>
                  )}
                </dl>
              ) : (
                <p className="text-xs text-mist-500">Not a repository, so nothing here is recoverable from a remote.</p>
              )}
            </Panel>

            <Panel title="Activity">
              <dl className="grid gap-2 text-xs">
                <Field label="State">
                  <span className="text-mist-100">{project.activity.state}</span>
                </Field>
                <Field label="Last touched">
                  <span className="font-mono text-mist-300">
                    {project.activity.lastActivityAt
                      ? new Date(project.activity.lastActivityAt * 1000).toLocaleDateString()
                      : "unknown"}
                  </span>
                </Field>
                {project.activity.idleDays !== null && (
                  <Field label="Idle">
                    <span className="font-mono text-mist-300">{project.activity.idleDays} days</span>
                  </Field>
                )}
              </dl>
            </Panel>
          </div>

          {project.duplicateOf.length > 0 && (
            <Panel title="Also on this machine">
              <ul className="grid gap-1.5">
                {project.duplicateOf.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => onOpenProject(path)}
                      className="w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-[11px] text-mist-300 transition-colors hover:bg-forest-850 hover:text-mist-100"
                    >
                      {path}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-mist-500">
                The same repository, checked out more than once. Every copy carries its own artifacts.
              </p>
            </Panel>
          )}

          <Panel title={`Artifacts (${owned.length})`}>
            {permanent && owned.length > 0 && (
              <label className="mb-3 block text-xs text-mist-300">
                Permanent deletion is on. Type <strong className="font-mono text-coral-200">Nuke</strong> to
                arm the buttons below.
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-forest-700 bg-forest-950 px-3 py-2 font-mono text-sm text-mist-100 outline-none focus:border-coral-300"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Permanent deletion confirmation"
                />
              </label>
            )}
            {owned.length === 0 ? (
              <p className="text-xs text-mist-500">
                Nothing here that a build can regenerate. The weight is source.
              </p>
            ) : (
              <ul className="grid gap-px overflow-hidden rounded-lg">
                {owned.map((target) => (
                  <motion.li
                    key={target.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 bg-forest-950 px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs text-mist-100">
                        {relativeTo(target.path, project.path)}
                      </span>
                      <span className="font-mono text-[10px] text-mist-500">
                        {target.label ?? target.category}
                        {target.sizeHasErrors && " · partly unreadable"}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-mist-300">
                      {target.sizePending ? "measuring..." : formatBytes(target.sizeBytes)}
                    </span>
                    {/* Absent rather than disabled for a location the catalogue
                        reports and never removes: a control the backend would
                        refuse should not be drawn at all. */}
                    {target.cleanable && (
                      <button
                        type="button"
                        onClick={() => void reclaim(target.id)}
                        disabled={cleaningTargetIds.has(target.id) || !armed}
                        aria-label={`Reclaim ${relativeTo(target.path, project.path)}`}
                        className="shrink-0 rounded-md p-1.5 text-mist-500 transition-colors hover:bg-forest-800 hover:text-coral-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {cleaningTargetIds.has(target.id) ? (
                          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 size={13} aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </motion.li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}

function Figure({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`text-lg font-semibold tracking-[-0.03em] ${accent ? "text-sage-300" : "text-mist-100"}`}>
        {value}
      </span>
      <span className="font-mono text-[10px] text-mist-500">{label}</span>
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-24 shrink-0 text-mist-500">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
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
