import { GitBranch } from "lucide-react";
import { Field, Panel } from "./panels";
import { remoteLabel } from "../../../utils/remoteUrl.mjs";
import type { Activity, GitContext } from "../../../types/workspace";

/** Seconds since the epoch, as Git and the index both report them. */
function asDate(seconds: number | null): string {
  return seconds ? new Date(seconds * 1000).toLocaleDateString() : "unknown";
}

/** What the repository says about itself. */
export function GitPanel({ git }: { git: GitContext }) {
  return (
    <Panel title="Git">
      {git.branch ? (
        <dl className="grid gap-2 text-xs">
          <Field label="Branch">
            <span className="inline-flex items-center gap-1.5 font-mono text-mist-100">
              <GitBranch size={11} aria-hidden="true" />
              {git.branch}
              {git.dirty && <span className="text-confidence-review">uncommitted changes</span>}
            </span>
          </Field>

          <Field label="Remote">
            {git.remote ? (
              <>
                {/* Named by what it points at, with the whole string a hover
                    away. A URL reads as owner/repo; a path has no shorter
                    honest form, so it keeps its own. */}
                <span className="block truncate font-mono text-mist-300" title={git.remote}>
                  {remoteLabel(git.remote) ?? git.remote}
                </span>
                {git.remoteIsLocal && (
                  <span className="block text-[10px] text-coral-300">a folder on this machine</span>
                )}
              </>
            ) : (
              <span className="text-mist-500">none</span>
            )}
          </Field>

          {git.lastCommitSummary && (
            <Field label="Last commit">
              <span className="block truncate text-mist-100" title={git.lastCommitSummary}>
                {git.lastCommitSummary}
              </span>
              {git.lastCommitAt && (
                <span className="block font-mono text-[10px] text-mist-500">{asDate(git.lastCommitAt)}</span>
              )}
            </Field>
          )}
        </dl>
      ) : (
        <p className="text-xs text-mist-500">Not a repository, so nothing here is recoverable from a remote.</p>
      )}
    </Panel>
  );
}

/** How long ago somebody cared about this. */
export function ActivityPanel({ activity }: { activity: Activity }) {
  return (
    <Panel title="Activity">
      <dl className="grid gap-2 text-xs">
        <Field label="State">
          <span className="text-mist-100">{activity.state}</span>
        </Field>
        <Field label="Last touched">
          <span className="font-mono text-mist-300">{asDate(activity.lastActivityAt)}</span>
        </Field>
        {activity.idleDays !== null && (
          <Field label="Idle">
            <span className="font-mono text-mist-300">{activity.idleDays} days</span>
          </Field>
        )}
      </dl>
    </Panel>
  );
}
