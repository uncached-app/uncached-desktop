import { GitBranch } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Field, Panel } from "./panels";
import { formatAge } from "../../../utils/format.mjs";
import { remoteLabel } from "../../../utils/remoteUrl.mjs";
import type { Activity, GitContext } from "../../../types/workspace";

/** Seconds since the epoch, as Git and the index both report them. */
function asDate(seconds: number | null, locale: string): string | null {
  return seconds ? new Date(seconds * 1000).toLocaleDateString(locale) : null;
}

function timeAgo(seconds: number | null): string | null {
  return seconds ? formatAge(seconds) : null;
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
function freshness(git: GitContext, t: TFunction): string {
  const checked = timeAgo(git.lastFetchAt);
  if (!checked) return t("workspace.git.neverFetched");
  if (git.behind === null) return t("workspace.git.checkedUntracked", { when: checked });
  if (git.behind === 0) return t("workspace.git.upToDate", { when: checked });
  return t("workspace.git.behind", { count: git.behind, when: checked });
}

/** What the repository says about itself. */
export function GitPanel({ git }: { git: GitContext }) {
  const { t, i18n } = useTranslation();

  return (
    <Panel
      title={t("workspace.git.title")}
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
          <Field label={t("workspace.git.branch")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-medium text-mist-100">{git.branch}</span>
              {git.dirty ? (
                <span className="rounded-md border border-confidence-review/40 bg-confidence-review-surface px-1.5 py-0.5 text-[10px] font-semibold text-confidence-review">
                  {t("workspace.git.dirty")}
                </span>
              ) : (
                <span className="rounded-md border border-forest-800 bg-forest-850 px-1.5 py-0.5 text-[10px] font-medium text-mist-500">
                  {t("workspace.git.clean")}
                </span>
              )}
            </div>
          </Field>

          <Field label={t("workspace.git.remote")}>
            {git.remote ? (
              <div className="min-w-0">
                <span className="block truncate font-mono text-mist-300" title={git.remote}>
                  {remoteLabel(git.remote) ?? git.remote}
                </span>
                {git.remoteIsLocal && (
                  <span className="mt-0.5 block text-[10px] font-medium text-coral-300">
                    {t("workspace.git.localRemote")}
                  </span>
                )}
                <span className="mt-0.5 block text-[10px] text-mist-500">{freshness(git, t)}</span>
              </div>
            ) : (
              <span className="text-mist-500">{t("workspace.git.noRemote")}</span>
            )}
          </Field>

          {git.lastCommitSummary && (
            <Field label={t("workspace.git.lastCommit")}>
              <div className="min-w-0">
                <p className="truncate font-medium text-mist-100" title={git.lastCommitSummary}>
                  {git.lastCommitSummary}
                </p>
                {git.lastCommitAt && (
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-mist-500">
                    <span className="font-mono">{asDate(git.lastCommitAt, i18n.language) ?? t("workspace.git.unknownDate")}</span>
                    <span>·</span>
                    <span>{timeAgo(git.lastCommitAt)}</span>
                  </div>
                )}
              </div>
            </Field>
          )}
        </dl>
      ) : (
        <p className="text-xs text-mist-500">{t("workspace.git.notRepository")}</p>
      )}
    </Panel>
  );
}

/** How long ago somebody cared about this. */
export function ActivityPanel({ activity }: { activity: Activity }) {
  const { t, i18n } = useTranslation();
  const isIdle = activity.idleDays !== null && activity.idleDays > 30;

  return (
    <Panel
      title={t("workspace.activity.title")}
      action={
        <span
          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            isIdle
              ? "border-forest-800 bg-forest-850 text-mist-500"
              : "border-sage-400/40 bg-sage-400/10 text-sage-300"
          }`}
        >
          {t(`workspace.activity.states.${activity.state}`)}
        </span>
      }
    >
      <dl className="grid gap-1 text-xs">
        <Field label={t("workspace.activity.lastTouched")}>
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium text-mist-100">{asDate(activity.lastActivityAt, i18n.language) ?? t("workspace.git.unknownDate")}</span>
            {activity.lastActivityAt && (
              <span className="text-[10px] text-mist-500 font-mono">
                ({timeAgo(activity.lastActivityAt)})
              </span>
            )}
          </div>
        </Field>

        {activity.idleDays !== null && (
          <Field label={t("workspace.activity.idleTime")}>
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium text-mist-300">{t("workspace.activity.idleDays", { count: activity.idleDays })}</span>
              {activity.idleDays > 90 && (
                <span className="rounded bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
                  {t("workspace.activity.cold")}
                </span>
              )}
            </div>
          </Field>
        )}
      </dl>
    </Panel>
  );
}
