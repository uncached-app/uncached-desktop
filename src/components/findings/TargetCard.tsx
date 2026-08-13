import { useState } from "react";
import { Box, Check, Copy, Folder, Layers, LoaderCircle, LockKeyhole, Package, RefreshCw, ShieldCheck, ShieldQuestion, TriangleAlert } from "lucide-react";
import type { ConfidenceLevel, ScanTarget } from "../../types/scan";

// The level is decided in Rust and arrives as a reason code. The wording is
// presentation, so it lives here; an unknown code renders as itself rather
// than disappearing.
const CONFIDENCE_REASONS: Record<string, string> = {
  knownArtifact: "Recognized build artifact",
  projectManifest: "Project manifest found alongside it",
  lockfile: "Lockfile found, contents are reproducible",
  declaredDisposable: "Declared disposable by the project's .gitignore",
  versionControlled: "Tracked by Git, so it is not a build output",
  versionManagerPath: "Version manager directory, holds globally installed packages",
  systemPath: "Belongs to the operating system, not to a project",
  recentlyModified: "Written to in the last day",
  noProjectContext: "No project found around it",
};

const CONFIDENCE_PRESENTATION: Record<ConfidenceLevel, { label: string; className: string; icon: typeof ShieldCheck }> = {
  high: { label: "High confidence", className: "border-forest-800 bg-forest-850 text-sage-300", icon: ShieldCheck },
  medium: { label: "Medium confidence", className: "border-amber-300/30 bg-forest-850 text-amber-300", icon: TriangleAlert },
  review: { label: "Review", className: "border-forest-700 bg-forest-850 text-mist-300", icon: ShieldQuestion },
};

interface TargetCardProps {
  target: ScanTarget;
  isCleaning: boolean;
  selected: boolean;
  onToggle: (targetId: string) => void;
  onRefreshSize: (targetId: string) => void;
  proEnabled: boolean;
}

function confidenceReasons(target: ScanTarget): string[] {
  return target.confidence.signals.map((signal) => CONFIDENCE_REASONS[signal] ?? signal);
}

function ConfidenceBadge({ target, expanded, onToggle }: { target: ScanTarget; expanded: boolean; onToggle: () => void }) {
  const presentation = CONFIDENCE_PRESENTATION[target.confidence.level];
  const Icon = presentation.icon;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-expanded={expanded}
      aria-label={`${presentation.label} for ${target.name}. Show the reasons`}
      title={confidenceReasons(target).join("\n")}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 font-sans text-[11px] font-medium transition-colors hover:border-sage-400/50 ${presentation.className}`}
    >
      <Icon size={11} aria-hidden="true" />
      {presentation.label}
    </button>
  );
}

// Rendered across the whole card rather than inside the column holding the
// badge: the reasons are sentences, and the size column is too narrow for them.
function ConfidenceReasons({ target }: { target: ScanTarget }) {
  return (
    <ul className="space-y-1 border-t border-forest-800 pt-2.5 sm:col-span-2">
      {confidenceReasons(target).map((reason) => (
        <li key={reason} className="flex items-start gap-2 text-[11px] leading-5 text-mist-500">
          <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-mist-500" />
          {reason}
        </li>
      ))}
    </ul>
  );
}

export function TargetCard({ target, isCleaning, selected, onToggle, onRefreshSize, proEnabled }: TargetCardProps) {
  const [copiedPath, setCopiedPath] = useState(false);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const proLocked = target.plan === "pro" && !proEnabled;
  const disabled = isCleaning || target.sizePending || target.sizeHasErrors || proLocked;

  async function handleCopyPath(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(target.path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error("Failed to copy path", err);
    }
  }

  function getCategoryIcon(category: string) {
    const cat = category.toUpperCase();
    if (cat.includes("NODE")) return <Package size={12} className="text-sage-300" aria-hidden="true" />;
    if (cat.includes("CARGO") || cat.includes("RUST") || cat.includes("BUILD")) {
      return <Box size={12} className="text-sage-300" aria-hidden="true" />;
    }
    if (cat.includes("FOLDER") || cat.includes("DIR")) {
      return <Folder size={12} className="text-sage-300" aria-hidden="true" />;
    }
    return <Layers size={12} className="text-sage-300" aria-hidden="true" />;
  }

  return (
    <article
      onClick={() => {
        if (!disabled) onToggle(target.id);
      }}
      className={`group grid select-none gap-3 rounded-2xl border p-4 transition-all duration-200 sm:grid-cols-[1fr_auto] sm:items-center ${
        disabled
          ? "cursor-not-allowed border-forest-800 bg-forest-900 text-mist-500"
          : selected
          ? "cursor-pointer border-sage-400 bg-forest-900"
          : "cursor-pointer border-forest-800 bg-forest-900 hover:border-sage-400"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <div
          role="checkbox"
          aria-checked={selected}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !disabled) {
              e.preventDefault();
              onToggle(target.id);
            }
          }}
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-all ${
            selected
              ? "border-sage-400 bg-sage-400 text-forest-950"
              : "border-forest-700 bg-forest-950 text-transparent group-hover:border-sage-400"
          }`}
        >
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-forest-800 bg-forest-800 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-sage-300">
              {getCategoryIcon(target.category)}
              {target.category}
            </span>
            <span className="text-xs font-medium text-mist-500">{target.name}</span>
            {proLocked && (
              <span className="inline-flex items-center gap-1 rounded-md border border-pro-200/30 bg-pro-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pro-100">
                <LockKeyhole size={10} aria-hidden="true" /> Pro
              </span>
            )}
          </div>

          <div className="group/path relative mt-1.5">
            <p
              onClick={handleCopyPath}
              className="truncate font-mono text-xs leading-5 text-mist-500 cursor-pointer transition-colors hover:text-mist-300"
              title={target.path}
            >
              {target.path}
            </p>

            {/* Centered Tooltip over path text */}
            <span
              className={`pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-forest-800 bg-forest-850 px-2 py-0.5 font-sans text-[11px] font-medium shadow-xl transition-all duration-200 ${
                copiedPath
                  ? "scale-100 opacity-100 border-sage-400/50 text-sage-300"
                  : "scale-95 opacity-0 text-mist-100 group-hover/path:scale-100 group-hover/path:opacity-100"
              }`}
            >
              {copiedPath ? (
                <>
                  <Check size={11} className="text-sage-300" strokeWidth={2.5} aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy size={11} className="text-mist-500" aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-forest-800" />
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pl-8 sm:gap-4 sm:pl-0">
        <ConfidenceBadge target={target} expanded={confidenceOpen} onToggle={() => setConfidenceOpen((open) => !open)} />

        <div className="text-right">
          {proLocked ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pro-100">
              <LockKeyhole size={14} aria-hidden="true" /> Unlock to clean
            </span>
          ) : target.sizePending ? (
            <span className="inline-flex items-center gap-2 text-sm text-mist-500">
              <LoaderCircle size={16} className="animate-spin text-sage-400" aria-hidden="true" /> Loading size
            </span>
          ) : target.sizeHasErrors ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-medium text-amber-300">Size unavailable</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefreshSize(target.id);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-forest-800 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-forest-850"
                aria-label={`Size failed for ${target.name}. Retry measurement`}
              >
                <RefreshCw size={13} aria-hidden="true" /> Retry
              </button>
            </div>
          ) : (
            <strong className={`block text-lg font-semibold ${selected ? "text-mist-100" : "text-mist-300"}`}>
              {target.formattedSize}
            </strong>
          )}
        </div>
      </div>

      {confidenceOpen && <ConfidenceReasons target={target} />}
    </article>
  );
}


