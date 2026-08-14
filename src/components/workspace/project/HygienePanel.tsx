import { useState } from "react";
import { Archive, GitBranch, Loader2, RefreshCw, ShieldAlert, Trees } from "lucide-react";
import { Panel } from "./panels";
import { isEmpty, type DeadBranch, type Hygiene } from "../../../types/hygiene";

/** Epoch seconds to something a person reads. */
function timeAgo(seconds: number | null): string | null {
  if (!seconds) return null;
  const days = Math.round((Date.now() - seconds * 1000) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

function Row({
  icon,
  name,
  detail,
  trailing,
}: {
  icon: React.ReactNode;
  name: string;
  detail: string;
  trailing?: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0 text-mist-500">{icon}</span>
        <div className="min-w-0">
          <span className="block truncate font-mono text-xs font-semibold text-mist-100" title={name}>
            {name}
          </span>
          <span className="mt-0.5 block text-[10px] text-mist-500">{detail}</span>
        </div>
      </div>
      {trailing}
    </li>
  );
}

function branchDetail(branch: DeadBranch): string {
  const age = timeAgo(branch.lastCommitAt);
  const state =
    branch.state === "prunable"
      ? "its remote branch is gone, and its commits are on this branch too"
      : "its remote branch is gone, and it still holds commits nothing else has";
  return age ? `${state} · last commit ${age}` : state;
}

/**
 * What this repository is carrying that nothing is using.
 *
 * Only one thing here is deletable, and the line between the two kinds of dead
 * branch is the point of the panel: both lost their remote branch, and only one
 * of them can go without losing commits. The other is named and left alone —
 * `git branch -D` is a decision the user makes in a terminal, not a button in a
 * cleanup tool.
 *
 * Stashes and worktrees are reported and never acted on. A stash is the purest
 * form of work that exists only on this disk, which is the one thing this
 * product refuses to destroy for you.
 */
export function HygienePanel({
  hygiene,
  loading,
  working,
  error,
  fetchedAt,
  lastFetchAt,
  onFetch,
  onPrune,
}: {
  hygiene: Hygiene;
  loading: boolean;
  working: boolean;
  error: string | null;
  /** Set once a fetch has run in this session. */
  fetchedAt: number | null;
  /** What the index read from `.git/FETCH_HEAD` when the page opened. */
  lastFetchAt: number | null;
  onFetch: () => void;
  onPrune: (branches: string[]) => Promise<{ deleted: string[]; refused: { name: string; reason: string }[] } | null>;
}) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const prunable = hygiene.deadBranches.filter((branch) => branch.state === "prunable");
  const checked = fetchedAt ?? lastFetchAt;

  async function pruneAll() {
    const result = await onPrune(prunable.map((branch) => branch.name));
    if (!result) return;
    const parts = [
      result.deleted.length > 0 &&
        `${result.deleted.length} ${result.deleted.length === 1 ? "branch" : "branches"} deleted`,
      result.refused.length > 0 && `${result.refused.length} refused by Git`,
    ].filter(Boolean);
    setOutcome(parts.length > 0 ? parts.join(" · ") : "Nothing left to delete");
  }

  return (
    <Panel
      title="Repository hygiene"
      action={
        <button
          type="button"
          onClick={onFetch}
          disabled={working || loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-forest-800 bg-forest-950 px-2.5 py-1 font-mono text-[11px] text-mist-300 transition-colors hover:bg-forest-850 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {working ? (
            <Loader2 size={11} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={11} aria-hidden="true" />
          )}
          <span>Fetch</span>
        </button>
      }
    >
      {/* Everything below is read from remote-tracking refs, which are a record
          of the last conversation with the remote. Saying when that was is the
          difference between a finding and a guess. */}
      <p className="text-[11px] leading-5 text-mist-500">
        {checked
          ? `Remote last checked ${timeAgo(checked)}. A branch only reads as dead once a fetch has pruned what the remote deleted.`
          : "This repository has never been fetched, so nothing here knows what the remote has done."}
      </p>

      {error && <p className="mt-2 font-mono text-[11px] leading-5 text-coral-300">{error}</p>}

      {loading ? (
        <p className="mt-3 text-xs text-mist-500">Reading branches, stashes and worktrees.</p>
      ) : isEmpty(hygiene) ? (
        <p className="mt-3 text-xs text-mist-300">
          No dead branches, no stashes, no extra worktrees.
        </p>
      ) : (
        <div className="mt-1 divide-y divide-forest-800">
          {hygiene.deadBranches.length > 0 && (
            <ul className="divide-y divide-forest-800">
              {hygiene.deadBranches.map((branch) => (
                <Row
                  key={branch.name}
                  icon={<GitBranch size={14} aria-hidden="true" />}
                  name={branch.name}
                  detail={branchDetail(branch)}
                  trailing={
                    branch.state === "holdsWork" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-coral-300/30 bg-coral-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-coral-300">
                        <ShieldAlert size={10} aria-hidden="true" />
                        keep
                      </span>
                    ) : null
                  }
                />
              ))}
            </ul>
          )}

          {hygiene.stashes.length > 0 && (
            <ul className="divide-y divide-forest-800">
              {hygiene.stashes.map((stash) => (
                <Row
                  key={stash.reference}
                  icon={<Archive size={14} aria-hidden="true" />}
                  name={stash.reference}
                  detail={[stash.message, timeAgo(stash.at)].filter(Boolean).join(" · ")}
                />
              ))}
            </ul>
          )}

          {hygiene.worktrees.length > 0 && (
            <ul className="divide-y divide-forest-800">
              {hygiene.worktrees.map((worktree) => (
                <Row
                  key={worktree.path}
                  icon={<Trees size={14} aria-hidden="true" />}
                  name={worktree.branch ?? worktree.path}
                  detail={
                    worktree.missing
                      ? `${worktree.path} — the directory is gone and the registration is not`
                      : worktree.path
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {prunable.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-forest-800 pt-3">
          <button
            type="button"
            onClick={pruneAll}
            disabled={working}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-forest-800 px-3 text-[11px] font-semibold text-mist-100 transition-colors hover:bg-forest-850 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete {prunable.length} merged {prunable.length === 1 ? "branch" : "branches"}
          </button>
          <span className="text-[11px] text-mist-500">
            Uses <span className="font-mono">git branch -d</span>, which refuses anything whose
            commits are not somewhere else.
          </span>
        </div>
      )}

      {outcome && <p className="mt-2 text-[11px] font-medium text-sage-300">{outcome}</p>}
    </Panel>
  );
}
