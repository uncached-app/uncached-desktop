import { HardDrive, Info, RotateCcw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import { Panel } from "./panels";
import { VERDICT_PRESENTATION, projectEvidence } from "../verdictPresentation";
import { preferred, useLaunchers } from "../../../hooks/useLaunchers";
import { useSettings } from "../../../hooks/useSettings";
import { copyText } from "../../../utils/clipboard";
import type { Footprint, Recoverability, Verdict, WorkspaceProject } from "../../../types/workspace";
import { describeFailure } from "../../../i18n/errors";

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
  onResult,
}: {
  project: WorkspaceProject;
  verdict: Verdict;
  footprint: Footprint | null;
  /** Told what happened, since the restore finishes in another window. */
  onResult: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const presentation = VERDICT_PRESENTATION[verdict];
  const atRisk = riskLines(project.git.recoverability, t);

  return (
    <Panel
      title={t("workspace.verdict.title")}
      action={
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${presentation.className}`}>
          <span className={`size-1.5 rounded-full ${presentation.dotClassName}`} aria-hidden="true" />
          {t(presentation.labelKey)}
        </span>
      }
    >
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-mist-100">{t(presentation.summaryKey)}</p>
          <p className="mt-0.5 text-xs text-mist-500">{projectEvidence(project, verdict, footprint, t)}</p>
        </div>

        {/* Risk & Safety status */}
        {atRisk.length > 0 && (
          <div className="border-t border-forest-800 pt-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-coral-300">
              {t("workspace.verdict.localWork")}
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
              <Trans i18nKey="workspace.verdict.localBackup" components={{ strong: <strong /> }} />
            </p>
          </div>
        )}

        {/* Lockfile / Dependencies warnings */}
        {(project.installMissing || project.installStale) && (
          <div className="flex items-start gap-2 border-t border-forest-800 pt-2.5 text-xs text-confidence-medium">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">
              {project.installMissing
                ? t("workspace.verdict.installMissing")
                : t("workspace.verdict.installStale")}
            </p>
          </div>
        )}

        {project.restore && (
          <RestoreLine restore={project.restore} path={project.path} onResult={onResult} />
        )}
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
function RestoreLine({
  restore,
  path,
  onResult,
}: {
  restore: NonNullable<WorkspaceProject["restore"]>;
  path: string;
  onResult: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const pinned = restore.pinnedBy !== null;
  const launchers = useLaunchers();
  const { settings } = useSettings();
  const [terminal] = preferred(
    (launchers ?? []).filter((launcher) => launcher.kind === "terminal"),
    settings?.preferredTerminal ?? null,
  );

  /**
   * Starts the reinstall in the user's own terminal.
   *
   * The command is not sent — the native side recomputes it from the lockfiles
   * on disk. A command travelling from here would turn "reinstall this project"
   * into "run anything", which is a different feature with a different blast
   * radius.
   *
   * The clipboard copy is the fallback, not the feature. Not every terminal can
   * be handed a command to run, and on one that cannot, the window opens in the
   * right directory with the command already copied — one paste instead of a
   * button that appears to do nothing.
   */
  async function restoreNow() {
    try {
      await copyText(restore.command);
    } catch {
      // A clipboard this webview cannot reach is not a reason to skip the
      // restore; it only costs the fallback.
    }
    if (!terminal) {
      onResult(t("workspace.restore.noTerminal"));
      return;
    }
    try {
      const started = await invoke<string>("restore_project", {
        path,
        program: terminal.program,
      });
      onResult(t("workspace.restore.running", { started, terminal: terminal.name }));
    } catch (error) {
      onResult(describeFailure(error, t("workspace.restore.failed")));
    }
  }

  return (
    <div
      className={`flex items-start justify-between gap-3 border-t border-forest-800 pt-2.5 text-xs ${
        pinned ? "text-mist-500" : "text-confidence-medium"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <RotateCcw size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="leading-relaxed">
          <Trans
            i18nKey={pinned ? "workspace.restore.pinned" : "workspace.restore.unpinned"}
            values={{ command: restore.command, pinnedBy: restore.pinnedBy }}
            components={{
              strong: <strong className="text-mist-300" />,
              code: (
                <code className="rounded bg-forest-850 px-1.5 py-0.5 font-mono text-[11px] text-mist-100" />
              ),
              mono: <span className="font-mono" />,
            }}
          />
        </p>
      </div>

      {/* Text until you reach for it. A filled button here would compete with
          the reclaim this panel argues for, and this is the opposite verb —
          nobody opens this page meaning to reinstall. */}
      <button
        type="button"
        onClick={() => void restoreNow()}
        title={
          terminal
            ? t("workspace.restore.runTitle", { command: restore.command, terminal: terminal.name })
            : t("workspace.restore.copyTitle", { command: restore.command })
        }
        className="group/restore inline-flex shrink-0 cursor-pointer items-center gap-1.5 self-start rounded-lg border border-transparent px-2 py-1 text-[11px] font-medium text-mist-300 transition-all hover:border-sage-400/50 hover:bg-forest-850 hover:text-sage-300"
      >
        <RotateCcw
          size={12}
          className="shrink-0 text-mist-500 transition-transform duration-300 group-hover/restore:-rotate-180 group-hover/restore:text-sage-300"
          aria-hidden="true"
        />
        {t("workspace.restore.action")}
      </button>
    </div>
  );
}

/** Everything that exists nowhere else, named individually. */
function riskLines(recoverability: Recoverability, t: TFunction): string[] {
  const lines = [
    [recoverability.unpushedCommits, "unpushedCommits"],
    [recoverability.stashEntries, "stashEntries"],
    [recoverability.branchesWithoutUpstream, "branchesWithoutUpstream"],
    [recoverability.untrackedFiles, "untrackedFiles"],
  ] as const;
  return lines
    .filter(([count]) => count > 0)
    .map(([count, kind]) => t(`workspace.verdict.risk.${kind}`, { count }));
}
