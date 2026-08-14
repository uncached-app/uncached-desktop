import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, FolderSearch, LoaderCircle, Trash2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CleanResult, ScanTarget, Step } from "../../types/scan";
import type { CleanMode } from "../../types/settings";
import { formatBytes } from "../../utils/format";
import { getCleanupReadyTargets, sortForListing } from "../../utils/scanReview.mjs";
import { isFreeTarget, summarizePlans } from "../../utils/entitlements.mjs";
import { TargetCard } from "./TargetCard";
import { openExternalUrl } from "../../utils/externalLink";

interface FindingsSectionProps {
  step: Step;
  scanning: boolean;
  cancelling: boolean;
  targets: ScanTarget[];
  cleaningTargetIds: Set<string>;
  cleanMode: CleanMode;
  cancelScan: () => void;
  onDone: () => void;
  cleanTarget: (targetId: string, confirmation?: string | null) => Promise<CleanResult | null>;
  refreshTargetSize: (targetId: string) => void;
  cleanupModeSupported: boolean;
  proEnabled: boolean;
  /** How many of the user's ignore rules were in force when this list was built. */
  activeIgnoreRules: number;
  onBack: () => void;
}

export function FindingsSection({
  step,
  scanning,
  targets,
  cleaningTargetIds,
  cleanMode,
  onDone,
  cleanTarget,
  refreshTargetSize,
  onBack,
  cleanupModeSupported,
  proEnabled,
  activeIgnoreRules,
}: FindingsSectionProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const readyTargets = getCleanupReadyTargets(targets);
  // Least certain first: a target the core is unsure about is the one worth
  // looking at, and it would otherwise sit below dozens of routine ones. On
  // Free, what the plan can actually clean comes before all of it.
  const listedTargets = sortForListing(targets, proEnabled);
  const freeTargets = proEnabled ? readyTargets : readyTargets.filter(isFreeTarget);
  const selectedTargets = freeTargets.filter((target) => selectedIds.has(target.id));
  const allSelected = freeTargets.length > 0 && selectedTargets.length === freeTargets.length;
  const deleteDisabled = scanning || confirming || deleting || selectedTargets.length === 0 || !cleanupModeSupported;
  const reducedMotion = useReducedMotion();
  const permanent = cleanMode === "Permanent";
  const confirmationReady = !permanent || confirmation === "Nuke";

  const selectedNoun = selectedTargets.length === 1 ? "target" : "targets";

  const { freeBytes, proBytes } = summarizePlans(readyTargets);
  const totalBytesFound = freeBytes + proBytes;
  const selectedBytes = selectedTargets.reduce((sum, t) => sum + t.sizeBytes, 0);

  useEffect(() => {
    const available = new Set(targets.map((target) => target.id));
    setSelectedIds((current) => new Set([...current].filter((id) => available.has(id))));
  }, [targets]);

  useEffect(() => {
    if (step !== 3) {
      setConfirming(false);
      setDeleting(false);
      setConfirmation("");
      setSelectedIds(new Set());
    }
  }, [step]);

  function toggleTarget(targetId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(freeTargets.map((target) => target.id)));
  }

  async function confirmDelete() {
    if (selectedTargets.length === 0 || !confirmationReady) return;
    setDeleting(true);
    const results = [];
    for (const target of selectedTargets) results.push(await cleanTarget(target.id, permanent ? confirmation : null));
    setDeleting(false);
    setConfirming(false);
    setConfirmation("");
    setSelectedIds(new Set());
    if (results.length > 0 && results.every(Boolean)) onDone();
  }

  if (step !== 3) return null;

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Scan targets"
      className="flex h-full w-full flex-col overflow-hidden"
    >
      <header className="shrink-0 border-b border-forest-800 pb-5">
        {/* Breadcrumb Navigation matching ProjectHeader */}
        <div className="mb-3 flex items-center gap-2 text-xs text-mist-500">
          <button
            type="button"
            onClick={onBack}
            disabled={scanning}
            className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-mist-500 transition-colors hover:bg-forest-900 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
            <span>Workspace</span>
          </button>
          <span className="opacity-40">/</span>
          <span className="truncate font-mono text-[11px] text-mist-300">Reclaim Targets</span>
        </div>

        {/* Top Summary & Actions Row */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-mist-100 sm:text-3xl">
                {targets.length} {targets.length === 1 ? "target" : "targets"}
              </h1>

              {readyTargets.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-baseline gap-1.5 rounded-xl border border-forest-800 bg-forest-900 px-3 py-1.5">
                    <span className="font-mono text-sm font-semibold text-mist-100">
                      {formatBytes(totalBytesFound)}
                    </span>
                    <span className="text-[11px] font-mono text-mist-500 uppercase tracking-wider">total found</span>
                  </div>

                  {selectedTargets.length > 0 && (
                    <div className="inline-flex items-baseline gap-1.5 rounded-xl border border-sage-400/40 bg-sage-400/10 px-3 py-1.5 text-sage-300">
                      <span className="font-mono text-sm font-bold">
                        {formatBytes(selectedBytes)}
                      </span>
                      <span className="text-[11px] font-mono text-sage-300/80 font-medium">
                        ({selectedTargets.length} selected)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Split for Free vs Pro when locked targets exist */}
            {!proEnabled && readyTargets.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2 text-xs font-medium">
                <span className="rounded-lg bg-sage-400/10 px-2.5 py-1 text-sage-300 font-mono text-[11px]">
                  Free · {formatBytes(freeBytes)}
                </span>
                {proBytes > 0 && (
                  <span className="rounded-lg bg-pro-surface px-2.5 py-1 text-pro-100 font-mono text-[11px]">
                    Pro · {formatBytes(proBytes)}
                  </span>
                )}
              </div>
            )}

            <p className="mt-2 text-xs text-mist-500">
              {permanent ? (
                <span className="font-medium text-coral-300">
                  Selected targets are deleted permanently. Not recoverable.
                </span>
              ) : (
                <span>Selected targets move to the Recycle Bin. Restorable from there if needed.</span>
              )}
            </p>

            {activeIgnoreRules > 0 && (
              <p className="mt-1 text-xs text-mist-500">
                {activeIgnoreRules === 1 ? "1 ignore rule is" : `${activeIgnoreRules} ignore rules are`} in force.
                Covered paths were excluded from this scan.
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={toggleAll}
              disabled={scanning || readyTargets.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-forest-800 bg-forest-900 px-3.5 py-2 text-xs font-medium text-mist-300 shadow-xs transition-all hover:border-sage-400/60 hover:bg-forest-850 hover:text-mist-100 disabled:opacity-40"
            >
              <div
                className={`grid size-4 place-items-center rounded border transition-colors ${
                  allSelected
                    ? "border-sage-400 bg-sage-400 text-forest-950"
                    : "border-forest-800 bg-forest-950 text-transparent"
                }`}
              >
                <Check size={11} strokeWidth={3} aria-hidden="true" />
              </div>
              <span>{allSelected ? "Deselect all" : "Select all"}</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={deleteDisabled}
              className="inline-flex min-h-10 min-w-32 items-center justify-center gap-2 rounded-xl bg-coral-300 px-4 text-sm font-semibold text-forest-950 shadow-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-forest-800 disabled:text-mist-500"
            >
              {confirming ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 size={16} aria-hidden="true" />
              )}
              <span>Delete ({selectedTargets.length})</span>
            </button>
          </div>
        </div>
      </header>

      {targets.length === 0 ? (
        <div className="my-5 grid min-h-52 flex-1 place-items-center rounded-3xl border border-forest-800 bg-forest-900 px-6 py-10 text-center">
          <div>
            <FolderSearch size={32} className="mx-auto text-mist-500" strokeWidth={1.5} aria-hidden="true" />
            <p className="mt-4 text-sm font-medium text-mist-300">
              {scanning ? "Scan in progress." : "No reclaimable targets in this workspace."}
            </p>
            <p className="mt-1 text-sm text-mist-500">
              {scanning
                ? "Targets appear as they are found."
                : "Adjust which caches are detected in Settings, under Scanning."}
            </p>
            {!scanning && (
              <button
                type="button"
                onClick={onBack}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-mist-300 hover:bg-forest-850 hover:text-sage-300"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                Back to Workspace
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {/* Softens the scroll edges: without them the list ends mid-card on a
              hard line, which reads as a rendering seam rather than as more
              content below. Purely decorative, so they never take a click. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-linear-to-b from-forest-950 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-linear-to-t from-forest-950 to-transparent"
          />
          <div className="h-full overflow-y-auto pr-1.5 pt-5 pb-8">
            {!proEnabled && proBytes > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pro-200/30 bg-pro-surface px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-mist-100">{formatBytes(proBytes)} more available with Pro</p>
                  <p className="mt-1 text-xs text-mist-500">Unlock every cleaner, Workspace and Intelligence.</p>
                </div>
                <button
                  type="button"
                  onClick={() => openExternalUrl("https://uncached.app/pro")}
                  className="rounded-xl bg-pro-200 px-3 py-2 text-xs font-semibold text-forest-950 transition-colors hover:bg-pro-100"
                >
                  Get Uncached Pro
                </button>
              </div>
            )}
            <div className="grid gap-3">
                {listedTargets.map((target) => (
                <motion.div
                  key={target.id}
                  initial={false}
                >
                  <TargetCard
                    target={target}
                    isCleaning={cleaningTargetIds.has(target.id)}
                    selected={selectedIds.has(target.id)}
                     onToggle={toggleTarget}
                     onRefreshSize={refreshTargetSize}
                     proEnabled={proEnabled}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {confirming && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-transparent p-5 backdrop-blur-sm" role="presentation">
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, scale: 0.95 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-confirm-title"
              className="w-full max-w-md rounded-3xl border border-forest-800 bg-forest-900 p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className={`mb-3 grid size-10 place-items-center rounded-xl ${deleting ? "bg-forest-800 text-sage-300" : "bg-coral-300/10 text-coral-300"}`}>
                      {deleting ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
                    </div>
                    <h2 id="delete-confirm-title" className="text-xl font-semibold text-mist-100">
                      {deleting ? (permanent ? "Deleting" : "Moving to Recycle Bin") : permanent ? "Delete permanently" : "Move to Recycle Bin"}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-mist-500">
                       {deleting
                         ? permanent
                           ? `Deleting ${selectedTargets.length} ${selectedNoun}...`
                           : `Moving ${selectedTargets.length} ${selectedNoun}...`
                         : permanent
                           ? `${selectedTargets.length} ${selectedNoun} will be deleted from disk. Not recoverable.`
                           : `${selectedTargets.length} ${selectedNoun} will be moved to the Recycle Bin. Restore from there if a build needs them.`}
                   </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="grid size-8 place-items-center rounded-lg text-mist-500 hover:bg-forest-800 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Close confirmation"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>
               {!deleting && <>
                 <p className="mt-5 rounded-xl border border-forest-800 bg-forest-950 px-4 py-3 text-sm text-mist-300">
                   Reclaims <strong className="text-mist-100">{formatBytes(selectedBytes)}</strong> (estimated)
                 </p>
                 {permanent && (
                   <label className="mt-4 block text-left text-sm text-mist-300">
                     Type <strong className="font-mono text-coral-300">Nuke</strong> to confirm.
                     <input
                       value={confirmation}
                       onChange={(event) => setConfirmation(event.target.value)}
                       className="mt-2 w-full rounded-xl border border-forest-800 bg-forest-950 px-3 py-2.5 font-mono text-sm text-mist-100 outline-none focus:border-coral-300"
                       autoComplete="off"
                       spellCheck={false}
                       aria-label="Permanent deletion confirmation"
                     />
                   </label>
                 )}
               </>}
              <div className="mt-6 flex justify-end gap-3">
                {deleting ? <button type="button" disabled className="inline-flex items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-mist-300"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> Cleaning...</button> : <>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm text-mist-300 hover:bg-forest-850"
                >
                  Cancel
                </button>
                <button
                  type="button"
                   onClick={confirmDelete}
                   disabled={!confirmationReady || selectedTargets.length === 0 || !cleanupModeSupported}
                   className="rounded-xl bg-coral-300 px-4 py-2.5 text-sm font-semibold text-forest-950 hover:opacity-90 disabled:cursor-not-allowed disabled:bg-forest-800 disabled:text-mist-500"
                 >
                   {permanent ? "Delete permanently" : "Move to Recycle Bin"}
                </button>
                </>}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
