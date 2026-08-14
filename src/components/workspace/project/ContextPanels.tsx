import { GitBranch } from "lucide-react";
import { Field, Panel } from "./panels";
import { remoteLabel } from "../../../utils/remoteUrl.mjs";
import type { Activity, GitContext } from "../../../types/workspace";

/** Seconds since the epoch, as Git and the index both report them. */
function asDate(seconds: number | null): string {
  return seconds ? new Date(seconds * 1000).toLocaleDateString() : "unknown";
}

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

/**
 * How far behind the remote this is, and how much that number is worth.
 *
 * `behind` is read from a remote-tracking ref, which records the last
 * conversation with the remote rather than the remote. Printing "0 behind" for a
 * repository nobody has fetched in a month would be reporting a silence as
 * agreement, so the age of the fetch is part of the same sentence — and with no
 * fetch at all there is no number to print.
 */
function freshness(git: GitContext): string {
  const checked = timeAgo(git.lastFetchAt);
  if (!checked) return "Never fetched, so nothing is known about the remote";
  if (git.behind === null) return `Checked ${checked}. This branch tracks nothing`;
  if (git.behind === 0) return `Up to date as of ${checked}`;
  return `${git.behind} ${git.behind === 1 ? "commit" : "commits"} behind as of ${checked}`;
}

/** What the repository says about itself. */
export function GitPanel({ git }: { git: GitContext }) {
  return (
    <Panel
      title="Git Context"
      action={
        git.branch ? (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-mist-500">
            <GitBranch size={12} className="text-sage-300" aria-hidden="true" />
            {git.branch}
          </span>
        ) : null
      }
    >
      {git.branch ? (
        <dl className="grid gap-1 text-xs">
          <Field label="Branch">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-medium text-mist-100">{git.branch}</span>
              {git.dirty ? (
                <span className="rounded-md border border-confidence-review/40 bg-confidence-review-surface px-1.5 py-0.5 text-[10px] font-semibold text-confidence-review">
                  uncommitted changes
                </span>
              ) : (
                <span className="rounded-md border border-forest-800 bg-forest-850 px-1.5 py-0.5 text-[10px] font-medium text-mist-500">
                  clean working tree
                </span>
              )}
            </div>
          </Field>

          <Field label="Remote">
            {git.remote ? (
              <div className="min-w-0">
                <span className="block truncate font-mono text-mist-300" title={git.remote}>
                  {remoteLabel(git.remote) ?? git.remote}
                </span>
                {git.remoteIsLocal && (
                  <span className="mt-0.5 block text-[10px] font-medium text-coral-300">
                    local directory on this drive
                  </span>
                )}
                <span className="mt-0.5 block text-[10px] text-mist-500">{freshness(git)}</span>
              </div>
            ) : (
              <span className="text-mist-500">No remote configured</span>
            )}
          </Field>

          {git.lastCommitSummary && (
            <Field label="Last commit">
              <div className="min-w-0">
                <p className="truncate font-medium text-mist-100" title={git.lastCommitSummary}>
                  {git.lastCommitSummary}
                </p>
                {git.lastCommitAt && (
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-mist-500">
                    <span className="font-mono">{asDate(git.lastCommitAt)}</span>
                    <span>·</span>
                    <span>{timeAgo(git.lastCommitAt)}</span>
                  </div>
                )}
              </div>
            </Field>
          )}
        </dl>
      ) : (
        <p className="text-xs text-mist-500">Not a git repository. No remote backup tracking available.</p>
      )}
    </Panel>
  );
}

/** How long ago somebody cared about this. */
export function ActivityPanel({ activity }: { activity: Activity }) {
  const isIdle = activity.idleDays !== null && activity.idleDays > 30;

  return (
    <Panel
      title="Activity"
      action={
        <span
          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            isIdle
              ? "border-forest-800 bg-forest-850 text-mist-500"
              : "border-sage-400/40 bg-sage-400/10 text-sage-300"
          }`}
        >
          {activity.state}
        </span>
      }
    >
      <dl className="grid gap-1 text-xs">
        <Field label="Last touched">
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium text-mist-100">{asDate(activity.lastActivityAt)}</span>
            {activity.lastActivityAt && (
              <span className="text-[10px] text-mist-500 font-mono">
                ({timeAgo(activity.lastActivityAt)})
              </span>
            )}
          </div>
        </Field>

        {activity.idleDays !== null && (
          <Field label="Idle time">
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium text-mist-300">{activity.idleDays} days</span>
              {activity.idleDays > 90 && (
                <span className="rounded bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
                  cold project
                </span>
              )}
            </div>
          </Field>
        )}
      </dl>
    </Panel>
  );
}
