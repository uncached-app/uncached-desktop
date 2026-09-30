import { ChevronRight, Copy, GitBranch, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { rootName } from "./naming";
import { formatBytes } from "../../../utils/format.mjs";
import { VERDICT_PRESENTATION, projectEvidence } from "../verdictPresentation";
import type { Footprint, RunningProject, Verdict, WorkspaceProject } from "../../../types/workspace";

/**
 * What the project weighs, and whether that figure is a total or a floor.
 *
 * `hasErrors` means some directory under it could not be read, so the walk
 * measured part of the project and the sum is the smallest it could be. Printed
 * plain, it would be a number the product states as fact and cannot stand
 * behind — which is the one thing the size column must never be.
 */
function OnDisk({ footprint }: { footprint: Footprint }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-baseline gap-1 font-mono text-xs">
      {footprint.hasErrors && (
        <span
          className="text-[10px] font-semibold text-mist-500"
          title={t("workspace.row.partial")}
        >
          &ge;
        </span>
      )}
      <span className="font-semibold text-mist-100">{formatBytes(footprint.totalBytes)}</span>
      <span className="text-[10px] text-mist-500">{t("workspace.row.onDisk")}</span>
    </div>
  );
}

/** One project: who it is, what the verdict rests on, and what it weighs. */
export function ProjectRow({
  project,
  verdict,
  footprint,
  running = null,
  first,
  showRoot,
  showVerdict = false,
  focused,
  onOpen,
  onContextMenu,
}: {
  project: WorkspaceProject;
  verdict: Verdict;
  footprint: Footprint | null;
  /** The process working inside it, when there is one. */
  running?: RunningProject | null;
  first: boolean;
  showRoot: boolean;
  /**
   * Carry the verdict on the row itself.
   *
   * Off inside a verdict group, where the sticky heading already says it and a
   * badge on every row would repeat it forty times. On in a flat list, where
   * nothing else does — and a row that offers a reclaim without saying whether
   * the project holds work that exists nowhere else is the one row this product
   * must never render.
   */
  showVerdict?: boolean;
  focused: boolean;
  onOpen: (path: string) => void;
  /** Right-click opens the same verbs the project's own page offers. */
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const evidence = projectEvidence(project, verdict, footprint, t);
  const share = footprint && footprint.totalBytes > 0 ? footprint.reclaimableBytes / footprint.totalBytes : 0;
  const isAtRisk = verdict === "protect";
  const isSafe = verdict === "safe";

  return (
    // A button rather than an article with a click handler: the row is the way
    // into everything you can do with a project, and a real button carries the
    // keyboard and the focus ring without either being reimplemented here.
    <button
      type="button"
      data-path={project.path}
      onClick={() => onOpen(project.path)}
      onContextMenu={onContextMenu}
      aria-label={t("workspace.row.details", { name: project.name })}
      className={`group flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition-colors cursor-pointer hover:bg-forest-850/80 ${
        first ? "" : "border-t border-forest-800"
      } ${focused ? "bg-forest-850 ring-1 ring-inset ring-sage-400" : ""}`}
    >
      {/* Left side: Project identity & evidence line */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {showVerdict && (
            <span
              className="inline-flex shrink-0 items-center gap-1.5"
              title={t(VERDICT_PRESENTATION[verdict].summaryKey)}
            >
              <span
                className={`size-2 shrink-0 rounded-full ${VERDICT_PRESENTATION[verdict].dotClassName}`}
                aria-hidden="true"
              />
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-mist-500">
                {t(VERDICT_PRESENTATION[verdict].labelKey)}
              </span>
            </span>
          )}
          <span className="truncate text-sm font-semibold tracking-tight text-mist-100">
            {project.name}
          </span>
          <span className="shrink-0 rounded border border-forest-800 bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-mist-300">
            {project.kind}
          </span>
          {project.git.branch && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-forest-800/80 bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
              <GitBranch size={10} className="text-mist-500" aria-hidden="true" />
              <span className="truncate max-w-28">{project.git.branch}</span>
            </span>
          )}
          {/* The directory it shares with other projects, when it has one:
              four folders under `uncached-app` are one piece of work, and the
              root they all share says nothing about which. Falls back to the
              root, which is the only answer for a project standing alone. */}
          {(project.family || showRoot) && (
            <span
              title={project.family ?? project.root}
              className={`shrink-0 truncate font-mono text-[10px] ${project.family ? "text-sage-300" : "text-mist-500"}`}
            >
              {project.family ? rootName(project.family) : rootName(project.root)}
            </span>
          )}
          {project.duplicateOf.length > 0 && (
            <span
              title={project.duplicateOf.join("\n")}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-forest-800/80 bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500"
            >
              <Copy size={9} aria-hidden="true" />
              {t("workspace.row.copies", { count: project.duplicateOf.length })}
            </span>
          )}
          {project.git.exposedSecrets.length > 0 && (
            <span
              title={project.git.exposedSecrets.map((file) => file.path).join("\n")}
              className="shrink-0 rounded border border-coral-300/40 bg-coral-surface px-1.5 py-0.5 font-mono text-[10px] text-coral-300"
            >
              {t("workspace.row.secretsExposed", { count: project.git.exposedSecrets.length })}
            </span>
          )}
        </div>

        {/* The sentence is the product: what is at stake or on offer */}
        <p
          className={`truncate text-xs ${
            isAtRisk
              ? "font-medium text-coral-300"
              : isSafe
              ? "text-mist-300"
              : "text-mist-500"
          }`}
        >
          {evidence}
        </p>
      </div>

      {/* Right side: On disk size, Reclaimable volume & Chevron */}
      <div className="shrink-0 flex items-center gap-3 text-end">
        <div className="flex flex-col items-end gap-0.5">
          {footprint ? (
            footprint.reclaimableBytes > 0 ? (
              <>
                <OnDisk footprint={footprint} />
                <div className="flex items-center gap-1.5">
                  <div
                    className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-forest-800"
                    aria-hidden="true"
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${isAtRisk ? "bg-mist-500" : "bg-sage-400"}`}
                      style={{ width: `${Math.max(8, share * 100)}%` }}
                    />
                  </div>
                  <span className={`font-mono text-[11px] font-semibold ${isAtRisk ? "text-mist-300" : "text-sage-300"}`}>
                    {formatBytes(footprint.reclaimableBytes)}
                  </span>
                  <span className="font-mono text-[10px] text-mist-500">{t("workspace.row.reclaimable")}</span>
                </div>
              </>
            ) : (
              <OnDisk footprint={footprint} />
            )
          ) : running ? (
            // Not "measuring...". A project being written to is never going to
            // finish measuring, and a spinner that never resolves is the app
            // claiming to be working while it has deliberately stopped.
            <span
              title={
                running.processes > 1
                  ? t("workspace.row.runningTitle.several", {
                      command: running.command,
                      count: running.processes,
                    })
                  : t("workspace.row.runningTitle.single", { command: running.command })
              }
              className="inline-flex items-center gap-1.5 font-mono text-[10px] text-coral-300"
            >
              <Radio size={10} aria-hidden="true" />
              {t("workspace.row.running", { command: running.command })}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-mist-500">{t("workspace.row.measuring")}</span>
          )}
        </div>

        {/* Subtle hover navigation chevron */}
        <div className="ps-0.5 text-mist-500 opacity-25 transition-all group-hover:opacity-100 group-hover:translate-x-0.5">
          <ChevronRight className="rtl:-scale-x-100" size={15} aria-hidden="true" />
        </div>
      </div>
    </button>
  );
}
