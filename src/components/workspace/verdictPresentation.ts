import type { TFunction } from "i18next";
import type { Activity, Footprint, Recoverability, Verdict, WorkspaceProject } from "../../types/workspace";
import { formatBytes } from "../../utils/format.mjs";

type VerdictPresentation = {
  labelKey: `workspace.verdicts.${Verdict}.label`;
  /** What the group means, in the user's terms. */
  summaryKey: `workspace.verdicts.${Verdict}.summary`;
  className: string;
  dotClassName: string;
  /**
   * The map, where a verdict is a filled circle rather than a word.
   *
   * A surface token filled and an ink token outlined, never ink filled: these
   * palettes put the readable colour on text — light theme's caution is
   * `#7a4f10`, a dark brown — so a circle painted with it is a mud blot on a
   * pale page, and six of them are a workspace that looks broken.
   */
  mapClassName: string;
};

/** Order of triage: what could lose work comes before what could save space. */
export const VERDICT_ORDER: Verdict[] = [
  "protect",
  "broken",
  "staleDeps",
  "tradeOff",
  "safe",
  "archivable",
  "unknown",
];

export const VERDICT_PRESENTATION: Record<Verdict, VerdictPresentation> = {
  protect: {
    labelKey: "workspace.verdicts.protect.label",
    summaryKey: "workspace.verdicts.protect.summary",
    className: "border-coral-300/30 bg-coral-300/10 text-coral-300",
    dotClassName: "bg-coral-300",
    mapClassName: "fill-coral-300/15 stroke-coral-300",
  },
  broken: {
    labelKey: "workspace.verdicts.broken.label",
    summaryKey: "workspace.verdicts.broken.summary",
    className: "border-confidence-medium/30 bg-confidence-medium-surface text-confidence-medium",
    dotClassName: "bg-confidence-medium",
    mapClassName: "fill-confidence-medium-surface stroke-confidence-medium",
  },
  staleDeps: {
    labelKey: "workspace.verdicts.staleDeps.label",
    summaryKey: "workspace.verdicts.staleDeps.summary",
    className: "border-confidence-medium/30 bg-confidence-medium-surface text-confidence-medium",
    dotClassName: "bg-confidence-medium",
    mapClassName: "fill-confidence-medium-surface stroke-confidence-medium",
  },
  tradeOff: {
    labelKey: "workspace.verdicts.tradeOff.label",
    summaryKey: "workspace.verdicts.tradeOff.summary",
    className: "border-confidence-review/30 bg-confidence-review-surface text-confidence-review",
    dotClassName: "bg-confidence-review",
    mapClassName: "fill-confidence-review-surface stroke-confidence-review",
  },
  safe: {
    labelKey: "workspace.verdicts.safe.label",
    summaryKey: "workspace.verdicts.safe.summary",
    className: "border-confidence-high/30 bg-confidence-high-surface text-confidence-high",
    dotClassName: "bg-confidence-high",
    mapClassName: "fill-confidence-high-surface stroke-confidence-high",
  },
  archivable: {
    labelKey: "workspace.verdicts.archivable.label",
    summaryKey: "workspace.verdicts.archivable.summary",
    className: "border-forest-800 bg-forest-850 text-mist-300",
    dotClassName: "bg-mist-500",
    mapClassName: "fill-forest-850 stroke-mist-500",
  },
  unknown: {
    labelKey: "workspace.verdicts.unknown.label",
    summaryKey: "workspace.verdicts.unknown.summary",
    className: "border-forest-800 bg-forest-850 text-mist-500",
    dotClassName: "bg-mist-500",
    mapClassName: "fill-forest-850 stroke-mist-500",
  },
};

/** The one sentence a row earns: what is at stake, or what is on offer. */
export function projectEvidence(
  project: WorkspaceProject,
  verdict: Verdict,
  footprint: Footprint | null,
  t: TFunction,
): string {
  if (verdict === "protect") {
    return atRisk(project.git.recoverability, t) ?? t("workspace.evidence.notOnRemote");
  }
  if (verdict === "broken") return t("workspace.evidence.broken");
  if (verdict === "staleDeps") return t("workspace.evidence.staleDeps");
  if (verdict === "unknown") {
    return project.git.remote ? t("workspace.evidence.gitUnreadable") : t("workspace.evidence.notRepository");
  }

  const idle = idleFor(project.activity, t);
  const reclaimable = footprint && footprint.reclaimableBytes > 0 ? formatBytes(footprint.reclaimableBytes) : null;

  if (verdict === "archivable") {
    return idle ? t("workspace.evidence.archivableIdle", { idle }) : t("workspace.evidence.archivable");
  }
  if (verdict === "safe") {
    return [idle, reclaimable && t("workspace.evidence.toReclaim", { size: reclaimable })]
      .filter(Boolean)
      .join(" · ");
  }
  return [idle, reclaimable && t("workspace.evidence.toReinstall", { size: reclaimable })]
    .filter(Boolean)
    .join(" · ");
}

/** Names what exists nowhere else, most alarming first. */
function atRisk(recoverability: Recoverability, t: TFunction): string | null {
  const parts = (
    [
      [recoverability.unpushedCommits, "unpushedCommits"],
      [recoverability.stashEntries, "stashEntries"],
      [recoverability.branchesWithoutUpstream, "branchesWithoutUpstream"],
      [recoverability.untrackedFiles, "untrackedFiles"],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, kind]) => t(`workspace.evidence.risk.${kind}`, { count }));
  return parts.length > 0 ? parts.join(t("workspace.evidence.risk.separator")) : null;
}

function idleFor(activity: Activity, t: TFunction): string | null {
  if (activity.idleDays === null) return null;
  if (activity.idleDays < 1) return t("workspace.evidence.touchedToday");
  if (activity.idleDays < 60) return t("workspace.evidence.idleDays", { count: activity.idleDays });
  return t("workspace.evidence.untouchedMonths", { count: Math.round(activity.idleDays / 30) });
}
