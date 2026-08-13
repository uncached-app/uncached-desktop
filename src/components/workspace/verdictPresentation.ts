import type { Activity, Footprint, Recoverability, Verdict, WorkspaceProject } from "../../types/workspace";
import { formatBytes } from "../../utils/format";

type VerdictPresentation = {
  label: string;
  /** What the group means, in the user's terms. */
  summary: string;
  className: string;
  dotClassName: string;
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
    label: "Protect",
    summary: "Holds work that exists only on this disk.",
    className: "border-coral-300/30 bg-coral-300/10 text-coral-300",
    dotClassName: "bg-coral-300",
  },
  broken: {
    label: "Needs install",
    summary: "A lockfile with nothing installed behind it.",
    className: "border-confidence-medium/30 bg-confidence-medium-surface text-confidence-medium",
    dotClassName: "bg-confidence-medium",
  },
  staleDeps: {
    label: "Stale install",
    summary: "The lockfile changed after the last install.",
    className: "border-confidence-medium/30 bg-confidence-medium-surface text-confidence-medium",
    dotClassName: "bg-confidence-medium",
  },
  tradeOff: {
    label: "In use",
    summary: "Reclaimable, but you will pay to reinstall.",
    className: "border-confidence-review/30 bg-confidence-review-surface text-confidence-review",
    dotClassName: "bg-confidence-review",
  },
  safe: {
    label: "Safe to reclaim",
    summary: "Everything is on a remote and nobody has touched it in months.",
    className: "border-confidence-high/30 bg-confidence-high-surface text-confidence-high",
    dotClassName: "bg-confidence-high",
  },
  archivable: {
    label: "Fully on remote",
    summary: "Nothing left to reclaim. The local copy is yours to keep or drop.",
    className: "border-forest-700 bg-forest-800 text-mist-300",
    dotClassName: "bg-mist-500",
  },
  unknown: {
    label: "Not established",
    summary: "Not enough was readable to judge. Never touched automatically.",
    className: "border-forest-700 bg-forest-800 text-mist-500",
    dotClassName: "bg-mist-500",
  },
};

/** The one sentence a row earns: what is at stake, or what is on offer. */
export function projectEvidence(
  project: WorkspaceProject,
  verdict: Verdict,
  footprint: Footprint | null,
): string {
  if (verdict === "protect") return atRisk(project.git.recoverability) ?? "Work that is not on any remote.";
  if (verdict === "broken") return "Install it before anything here can be judged.";
  if (verdict === "staleDeps") return "The installed dependencies no longer match the lockfile.";
  if (verdict === "unknown") return project.git.remote ? "Git could not be read." : "Not a repository.";

  const idle = idleFor(project.activity);
  const reclaimable = footprint ? formatBytes(footprint.reclaimableBytes) : null;

  if (verdict === "archivable") {
    return idle ? `${idle}, and every commit is on the remote.` : "Every commit is on the remote.";
  }
  if (verdict === "safe") {
    return [idle, reclaimable && `${reclaimable} to reclaim`].filter(Boolean).join(" · ");
  }
  return [idle, reclaimable && `${reclaimable} would need reinstalling`].filter(Boolean).join(" · ");
}

/** Names what exists nowhere else, most alarming first. */
function atRisk(recoverability: Recoverability): string | null {
  const parts = [
    count(recoverability.unpushedCommits, "commit", "not pushed"),
    count(recoverability.stashEntries, "stash", "saved"),
    count(recoverability.branchesWithoutUpstream, "branch", "with no remote"),
    count(recoverability.untrackedFiles, "file", "never committed"),
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(", ")} — only on this disk.` : null;
}

function count(value: number, noun: string, suffix: string): string | null {
  if (value === 0) return null;
  return `${value} ${value === 1 ? noun : `${noun}s`} ${suffix}`;
}

function idleFor(activity: Activity): string | null {
  if (activity.idleDays === null) return null;
  if (activity.idleDays < 1) return "Touched today";
  if (activity.idleDays < 60) return `Idle ${activity.idleDays} days`;
  const months = Math.round(activity.idleDays / 30);
  return `Untouched for ${months} months`;
}
