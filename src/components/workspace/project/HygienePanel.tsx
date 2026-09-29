import { useState } from "react";
import type { TFunction } from "i18next";
import { Archive, GitBranch, Loader2, RefreshCw, ShieldAlert, Trees } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Panel } from "./panels";
import { formatAge } from "../../../utils/format.mjs";
import { isEmpty, type DeadBranch, type Hygiene } from "../../../types/hygiene";

/** Epoch seconds to something a person reads. */
function timeAgo(seconds: number | null): string | null {
  return seconds ? formatAge(seconds) : null;
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

function branchDetail(branch: DeadBranch, t: TFunction): string {
  const age = timeAgo(branch.lastCommitAt);
  const state =
    branch.state === "prunable"
      ? t("workspace.hygiene.branch.prunable")
      : t("workspace.hygiene.branch.holdsWork");
  return age ? t("workspace.hygiene.branch.withAge", { state, age }) : state;
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
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<string | null>(null);
  const prunable = hygiene.deadBranches.filter((branch) => branch.state === "prunable");
  const checked = fetchedAt ?? lastFetchAt;

  async function pruneAll() {
    const result = await onPrune(prunable.map((branch) => branch.name));
    if (!result) return;
    const parts = [
      result.deleted.length > 0 &&
        t("workspace.hygiene.outcome.deleted", { count: result.deleted.length }),
      result.refused.length > 0 && t("workspace.hygiene.outcome.refused", { count: result.refused.length }),
    ].filter(Boolean);
    setOutcome(parts.length > 0 ? parts.join(" · ") : t("workspace.hygiene.outcome.nothing"));
  }

  return (
    <Panel
      title={t("workspace.hygiene.title")}
      action={
        <button
          type="button"
          onClick={onFetch}
          disabled={working || loading}
          aria-label={t("workspace.hygiene.fetchLabel")}
          className="group inline-flex items-center gap-1.5 rounded-xl bg-sage-400 px-3 py-1.5 text-xs font-semibold text-forest-950 shadow-xs transition-all hover:bg-sage-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          {working ? (
            <Loader2 size={12} className="animate-spin text-forest-950" aria-hidden="true" />
          ) : (
            <RefreshCw
              size={12}
              className="text-forest-950 transition-transform duration-200 group-hover:rotate-45"
              aria-hidden="true"
            />
          )}
          <span>{t("workspace.hygiene.fetch")}</span>
        </button>
      }
    >
      {/* Everything below is read from remote-tracking refs, which are a record
          of the last conversation with the remote. Saying when that was is the
          difference between a finding and a guess. */}
      <p className="text-[11px] leading-5 text-mist-500">
        {checked
          ? t("workspace.hygiene.checked", { when: timeAgo(checked) })
          : t("workspace.hygiene.neverFetched")}
      </p>

      {error && <p className="mt-2 font-mono text-[11px] leading-5 text-coral-300">{error}</p>}

      {loading ? (
        <p className="mt-3 text-xs text-mist-500">{t("workspace.hygiene.loading")}</p>
      ) : isEmpty(hygiene) ? (
        <p className="mt-3 text-xs text-mist-300">
          {t("workspace.hygiene.empty")}
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
                  detail={branchDetail(branch, t)}
                  trailing={
                    branch.state === "holdsWork" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-coral-300/30 bg-coral-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-coral-300">
                        <ShieldAlert size={10} aria-hidden="true" />
                        {t("workspace.hygiene.keep")}
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
                      ? t("workspace.hygiene.worktreeMissing", { path: worktree.path })
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
            className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-coral-300/40 bg-coral-300/15 px-3 text-xs font-semibold text-coral-300 shadow-xs transition-all hover:bg-coral-300/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {t("workspace.hygiene.deleteMerged", { count: prunable.length })}
          </button>
          <span className="text-[11px] text-mist-500">
            <Trans i18nKey="workspace.hygiene.deleteHint" components={{ mono: <span className="font-mono" /> }} />
          </span>
        </div>
      )}

      {outcome && <p className="mt-2 text-[11px] font-medium text-sage-300">{outcome}</p>}
    </Panel>
  );
}
