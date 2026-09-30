import { useState } from "react";
import { Check, Copy, Eye, LoaderCircle, LockKeyhole, Radio, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatAge, formatBytes } from "../../utils/format.mjs";
import { translatedCategoryPresentation } from "./categoryPresentation";
import { CONFIDENCE_PRESENTATION } from "./confidencePresentation";
import type { ScanTarget } from "../../types/scan";

// Reason codes as Rust sends them. An unknown code renders as itself rather
// than disappearing.
const CONFIDENCE_REASONS = [
  "knownArtifact",
  "projectManifest",
  "lockfile",
  "declaredDisposable",
  "versionControlled",
  "versionManagerPath",
  "systemPath",
  "noProjectContext",
  "knownLocation",
  "sharedCache",
  "toolState",
] as const;

type ConfidenceReason = (typeof CONFIDENCE_REASONS)[number];

function isKnownReason(signal: string): signal is ConfidenceReason {
  return (CONFIDENCE_REASONS as readonly string[]).includes(signal);
}

interface TargetCardProps {
  target: ScanTarget;
  /** The list container draws the top edge; every other row draws its own. */
  first: boolean;
  isCleaning: boolean;
  selected: boolean;
  onToggle: (targetId: string) => void;
  onRefreshSize: (targetId: string) => void;
  proEnabled: boolean;
}

function ConfidenceBadge({ target, expanded, onToggle }: { target: ScanTarget; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const presentation = CONFIDENCE_PRESENTATION[target.confidence.level];
  const levelLabel = t(`findings.confidence.levels.${target.confidence.level}`);
  const Icon = presentation.icon;

  return (
    <div className="group/confidence relative shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        aria-expanded={expanded}
        // Icon only, so the name has to carry what the shape means.
        aria-label={t("findings.confidence.badgeLabel", { level: levelLabel, name: target.name })}
        className={`grid size-6 place-items-center rounded-md border leading-none transition-colors hover:border-sage-400/50 ${presentation.className}`}
      >
        <Icon size={13} aria-hidden="true" />
      </button>

      {/* Anchored right instead of centered: the badge sits at the card's edge,
          and a centered tooltip would hang outside it. Focus opens it too, so a
          keyboard reaches what the mouse gets. */}
      <span
        role="tooltip"
        className={`pointer-events-none absolute -top-8 end-0 z-10 flex scale-95 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 font-sans text-[11px] font-medium opacity-0 shadow-xl transition-all duration-200 group-hover/confidence:scale-100 group-hover/confidence:opacity-100 ${presentation.className}`}
      >
        <Icon size={11} aria-hidden="true" />
        {levelLabel}
        <span className={`absolute -bottom-1 end-2.5 border-x-4 border-t-4 border-x-transparent ${presentation.arrowClassName}`} />
      </span>
    </div>
  );
}

// Rendered across the whole card rather than inside the column holding the
// badge: the reasons are sentences, and the size column is too narrow for them.
function ConfidenceReasons({ target }: { target: ScanTarget }) {
  const { t } = useTranslation();
  const presentation = CONFIDENCE_PRESENTATION[target.confidence.level];
  const reasons = target.confidence.signals.map((signal) =>
    isKnownReason(signal) ? t(`findings.confidence.reasons.${signal}`) : signal,
  );

  return (
    <div className="border-t border-forest-800 pt-2.5 sm:col-span-2">
      <p className={`text-[11px] font-medium ${presentation.textClassName}`}>
        {t(`findings.confidence.levels.${target.confidence.level}`)}
      </p>
      <ul className="mt-1.5 space-y-1">
        {reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-2 text-[11px] leading-5 text-mist-500">
            <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-mist-500" />
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TargetCard({ target, first, isCleaning, selected, onToggle, onRefreshSize, proEnabled }: TargetCardProps) {
  const { t } = useTranslation();
  const [copiedPath, setCopiedPath] = useState(false);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const proLocked = target.plan === "pro" && !proEnabled;
  // Reported, never removed. The backend refuses it because no provider vouches
  // for it; the card leaves the checkbox out so the refusal is never reached.
  const reportOnly = target.cleanable === false;
  // Disposable, but not now: the tool that wrote it is running. Reported with
  // its weight like everything else — hiding it would move the totals between
  // two scans with nothing on screen accounting for the difference — and with
  // no control, because the backend refuses it at removal either way.
  const inUse = target.blockedBy ?? null;
  const disabled =
    isCleaning || target.sizePending || target.sizeHasErrors || proLocked || reportOnly || inUse !== null;
  const category = translatedCategoryPresentation(target.category, t);
  const age = formatAge(target.lastUsedAt);
  const CategoryIcon = category.icon;

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

  return (
    <article
      onClick={() => {
        if (!disabled) onToggle(target.id);
      }}
      /* A row in a list, not a card of its own — the container draws the one
         border. State is carried by the surface and by a left edge, because a
         row cannot change its border without moving its neighbours: a locked
         row recedes to the canvas colour and takes the Pro tint, a selected one
         is marked on the inside edge. */
      className={`group grid select-none gap-3 px-4 py-3.5 transition-colors duration-200 sm:grid-cols-[1fr_auto] sm:items-center ${
        first ? "" : "border-t border-forest-800"
      } ${
        proLocked
          ? "cursor-not-allowed bg-forest-950 text-mist-500 shadow-[inset_3px_0_0_0_var(--color-pro-200)] rtl:shadow-[inset_-3px_0_0_0_var(--color-pro-200)]"
          : disabled
            ? "cursor-not-allowed text-mist-500"
            : selected
              ? "cursor-pointer bg-forest-850 shadow-[inset_3px_0_0_0_var(--color-sage-400)] rtl:shadow-[inset_-3px_0_0_0_var(--color-sage-400)]"
              : "cursor-pointer hover:bg-forest-850/60"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        {inUse ? (
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-coral-300/40 text-coral-300"
          >
            <Radio size={12} />
          </span>
        ) : reportOnly ? (
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-forest-800 text-mist-500"
          >
            <Eye size={12} />
          </span>
        ) : (
          <div
            role="checkbox"
            aria-checked={selected}
            aria-disabled={disabled}
            aria-label={t("findings.row.select", { name: target.name })}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !disabled) {
                e.preventDefault();
                onToggle(target.id);
              }
            }}
            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-all ${selected
              ? "border-sage-400 bg-sage-400 text-forest-950"
              : disabled
                ? "border-forest-800 bg-forest-900 text-transparent"
                : "border-forest-800 bg-forest-950 text-transparent group-hover:border-sage-400"
              }`}
          >
            <Check size={13} strokeWidth={3} aria-hidden="true" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-forest-800 bg-forest-800 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-sage-300">
              <CategoryIcon size={12} className="text-sage-300" aria-hidden="true" />
              {category.label}
            </span>
            {/* A discovered cache is named by the tool that wrote it. Its
                directory is called `store`, `_cacache` or `Cache`, which would
                leave the user guessing which tool each row belongs to. */}
            <span className="text-xs font-medium text-mist-500">{target.label ?? target.name}</span>
            {age && (
              <span
                title={t("findings.row.ageHint")}
                className="font-mono text-[11px] text-mist-500"
              >
                {age}
              </span>
            )}
            {inUse && (
              <span
                title={t("findings.row.inUseHint", { tool: inUse })}
                className="inline-flex items-center gap-1 rounded-md border border-coral-300/40 bg-coral-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-coral-300"
              >
                <Radio size={10} aria-hidden="true" /> {t("findings.row.inUse")}
              </span>
            )}
            {proLocked && (
              <span className="inline-flex items-center gap-1 rounded-md border border-pro-200/30 bg-pro-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pro-100">
                <LockKeyhole size={10} aria-hidden="true" /> Pro
              </span>
            )}
          </div>

          <div className="mt-1.5 flex items-center">
            <div className="group/path relative inline-flex max-w-full items-center">
              <p
                onClick={handleCopyPath}
                className="truncate font-mono text-xs leading-5 text-mist-500 cursor-pointer transition-colors hover:text-mist-300"
                title={target.path}
              >
                {target.path}
              </p>

              {/* Tooltip centered below the path text */}
              <span
                role="tooltip"
                className={`pointer-events-none absolute top-full left-1/2 z-20 mt-1.5 -translate-x-1/2 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-forest-800 bg-forest-850 px-2 py-0.5 font-sans text-[11px] font-medium shadow-xl transition-all duration-200 ${copiedPath
                  ? "scale-100 opacity-100 border-sage-400/50 text-sage-300"
                  : "scale-95 opacity-0 text-mist-100 group-hover/path:scale-100 group-hover/path:opacity-100"
                  }`}
              >
                {copiedPath ? (
                  <>
                    <Check size={11} className="text-sage-300" strokeWidth={2.5} aria-hidden="true" />
                    <span>{t("findings.row.copied")}</span>
                  </>
                ) : (
                  <>
                    <Copy size={11} className="text-mist-500" aria-hidden="true" />
                    <span>{t("findings.row.copy")}</span>
                  </>
                )}
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 border-x-4 border-b-4 border-x-transparent border-b-forest-800" />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 ps-8 sm:gap-4 sm:ps-0">
        <div className="text-end">
          {reportOnly ? (
            <div className="flex flex-col items-end gap-0.5">
              <strong className="block text-lg font-semibold text-mist-300">{formatBytes(target.sizeBytes)}</strong>
              <span className="text-[10px] font-medium text-mist-500">{t("findings.row.reportedNotRemoved")}</span>
            </div>
          ) : target.sizePending ? (
            <span className="inline-flex items-center gap-2 text-sm text-mist-500">
              <LoaderCircle size={16} className="animate-spin text-sage-400" aria-hidden="true" /> {t("findings.row.loadingSize")}
            </span>
          ) : target.sizeHasErrors ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-medium text-confidence-medium">{t("findings.row.sizeUnavailable")}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefreshSize(target.id);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-forest-800 px-2.5 py-1 text-xs font-medium text-confidence-medium hover:bg-forest-850"
                aria-label={t("findings.row.retryLabel", { name: target.name })}
              >
                <RefreshCw size={13} aria-hidden="true" /> {t("findings.row.retry")}
              </button>
            </div>
          ) : inUse ? (
            <div className="flex flex-col items-end gap-0.5">
              <strong className="block text-lg font-semibold text-mist-300">
                {formatBytes(target.sizeBytes)}
              </strong>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-coral-300">
                <Radio size={10} aria-hidden="true" /> {t("findings.row.toolRunning", { tool: inUse })}
              </span>
            </div>
          ) : proLocked ? (
            /* The weight, and then what the plan can do about it.

               This row used to say "Unlock to clean" *instead of* the size, and
               it was the only row in the app that withheld a number it already
               had — the target is walked and measured exactly like every other
               one, whatever the plan. The screen was already honest in
               aggregate, two elements away: the header chip reads "Free 4.2 GB
               · Pro 11 GB" and the banner offers the same total again. Only the
               row it came from would not say its own share.

               Withholding it also argued against the sale it was making. "Pro"
               is worth buying in proportion to a number, and this was the one
               place a reader could check that number against a path they
               recognise. */
            <div className="flex flex-col items-end gap-0.5">
              <strong className="block text-lg font-semibold text-mist-300">
                {formatBytes(target.sizeBytes)}
              </strong>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-pro-100">
                <LockKeyhole size={10} aria-hidden="true" /> {t("findings.row.unlockToClean")}
              </span>
            </div>
          ) : (
            <strong className={`block text-lg font-semibold ${selected ? "text-mist-100" : "text-mist-300"}`}>
              {formatBytes(target.sizeBytes)}
            </strong>
          )}
        </div>

        <ConfidenceBadge target={target} expanded={confidenceOpen} onToggle={() => setConfidenceOpen((open) => !open)} />
      </div>

      {confidenceOpen && <ConfidenceReasons target={target} />}
    </article>
  );
}


