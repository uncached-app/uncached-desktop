import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, FolderSearch, LoaderCircle, Radio, Trash2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CleanResult, ScanTarget, Step } from "../../types/scan";
import type { CleanMode } from "../../types/settings";
import type { RunningProject } from "../../types/workspace";
import { formatBytes } from "../../utils/format.mjs";
import { isInside } from "../../utils/paths.mjs";
import { getCleanupReadyTargets, holdsNothing, sortForListing } from "../../utils/scanReview.mjs";
import type { ListOrder } from "../../utils/scanReview.d.mts";
import { isFreeTarget, summarizePlans } from "../../utils/entitlements.mjs";
import { TargetCard } from "./TargetCard";
import { openExternalUrl } from "../../utils/externalLink";
import { ChoiceRow } from "../shared/ChoiceRow";
import { StatCard } from "../shared/StatCard";

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
  /** Folders the walk was not allowed to open, so the totals can say they are a floor. */
  unreadable: number;
  /** What the backend said about the last refusal, if it said anything. */
  error: string | null;
  /**
   * The projects something is working inside, by path.
   *
   * A target under one of them is not removable — the process holds files open
   * inside it — so selecting it has to say so before the button is pressed
   * rather than after the system refuses.
   */
  running: Record<string, RunningProject>;
  onBack: () => void;
}

export function FindingsSection({
  step,
  scanning,
  targets: scannedTargets,
  cleaningTargetIds,
  cleanMode,
  onDone,
  cleanTarget,
  refreshTargetSize,
  onBack,
  cleanupModeSupported,
  proEnabled,
  activeIgnoreRules,
  unreadable,
  running,
  error,
}: FindingsSectionProps) {
  // Every count, total, selection and listing below derives from this set.
  const targets = scannedTargets.filter((target) => !holdsNothing(target));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Targets the last cleanup asked for and did not get. */
  const [failed, setFailed] = useState<ScanTarget[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  // Confidence first, because a target the core is unsure about is the one
  // worth a human's attention. Weight is the other reading and it had no way in.
  const [order, setOrder] = useState<ListOrder>("confidence");
  const readyTargets = getCleanupReadyTargets(targets);
  // Least certain first: a target the core is unsure about is the one worth
  // looking at, and it would otherwise sit below dozens of routine ones. On
  // Free, what the plan can actually clean comes before all of it.
  const listedTargets = sortForListing(targets, proEnabled, order);
  const freeTargets = proEnabled ? readyTargets : readyTargets.filter(isFreeTarget);
  const selectedTargets = freeTargets.filter((target) => selectedIds.has(target.id));
  const allSelected = freeTargets.length > 0 && selectedTargets.length === freeTargets.length;
  const deleteDisabled = scanning || confirming || deleting || selectedTargets.length === 0 || !cleanupModeSupported;
  const reducedMotion = useReducedMotion();
  const permanent = cleanMode === "Permanent";
  const confirmationReady = !permanent || confirmation === "Nuke";

  const selectedNoun = selectedTargets.length === 1 ? "target" : "targets";
  // Catalogued caches whose tool is running. Counted from the whole list, not
  // from the ready set — they are excluded from that by definition, which is
  // exactly why the number has to be said somewhere.
  const inUse = targets.filter((target) => target.blockedBy);
  const held = Object.values(running);
  const heldSelection = held.length === 0
    ? []
    : selectedTargets.filter((target) =>
        held.some((project) => isInside(target.path, project.path)),
      );

  const { freeBytes, proBytes } = summarizePlans(readyTargets);
  const totalBytesFound = freeBytes + proBytes;
  const selectedBytes = selectedTargets.reduce((sum, t) => sum + t.sizeBytes, 0);

  useEffect(() => {
    const available = new Set(targets.map((target) => target.id));
    setSelectedIds((current) => new Set([...current].filter((id) => available.has(id))));
    // A target that is gone is one that was removed, so a refusal about it is
    // no longer true.
    setFailed((current) => current.filter((target) => available.has(target.id)));
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
    setFailed([]);
    // Which ones the backend refused, not how many.
    //
    // A cleanup of forty targets where two are refused used to end the same way
    // as one where none were: the dialog closed, the selection emptied, and the
    // two rows stayed on screen with nothing saying they had been asked for and
    // declined. The rest of the app never showed the error `cleanTarget`
    // recorded, so the only evidence was a row that did not disappear.
    const refused: ScanTarget[] = [];
    for (const target of selectedTargets) {
      const result = await cleanTarget(target.id, permanent ? confirmation : null);
      if (!result) refused.push(target);
    }
    setDeleting(false);
    setConfirming(false);
    setConfirmation("");
    // The refused stay selected: they are still what the user asked for, and
    // pressing again after closing the tool that holds them is the fix.
    setSelectedIds(new Set(refused.map((target) => target.id)));
    setFailed(refused);
    if (refused.length === 0) onDone();
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
      <header className="shrink-0 border-b border-forest-800 pb-4">
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

        {/* Laid out like the workspace header, because they are the same kind
            of screen: what it adds up to on the left, the one destructive
            action pinned top-right, and the controls in a bar of their own
            underneath. The two used to diverge in type scale, in how a figure
            was drawn, and in whether the order control sat inside a bordered
            box of its own — a card inside a card. */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <h1 className="mr-1 shrink-0 text-xl font-bold tracking-tight text-mist-100 sm:text-2xl">
              {targets.length} {targets.length === 1 ? "target" : "targets"}
            </h1>

            {readyTargets.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <StatCard
                  value={formatBytes(totalBytesFound)}
                  label="reclaimable"
                  /* The heading counts every target; this covers only the ones
                     a reclaim could take. Side by side with nothing between
                     them the two numbers describe different sets and read as
                     one claim. */
                  title={
                    readyTargets.length < targets.length
                      ? `Across ${readyTargets.length} of the ${targets.length} targets — the rest are still being measured, failed to measure, or are reported and never removed.`
                      : undefined
                  }
                />

                {selectedTargets.length > 0 && (
                  <StatCard
                    value={formatBytes(selectedBytes)}
                    label={`selected (${selectedTargets.length})`}
                    accent
                  />
                )}

                {inUse.length > 0 && (
                  <span
                    title={inUse
                      .map((target) => `${target.label ?? target.name} — ${target.blockedBy} is running`)
                      .join("\n")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-coral-300/40 bg-coral-surface px-3 py-1.5 font-mono text-[11px] text-coral-300"
                  >
                    <Radio size={11} aria-hidden="true" />
                    {formatBytes(inUse.reduce((sum, target) => sum + target.sizeBytes, 0))} in use
                  </span>
                )}

                {!proEnabled && (
                  <span className="rounded-xl border border-forest-800 bg-forest-900 px-3 py-1.5 font-mono text-[11px] text-mist-500">
                    Free {formatBytes(freeBytes)}
                    {proBytes > 0 && <span className="text-pro-100"> · Pro {formatBytes(proBytes)}</span>}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={deleteDisabled}
              title={
                cleanupModeSupported
                  ? undefined
                  : "Uncached could not read what this system allows it to remove, so nothing is offered."
              }
              className="group inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-coral-300 px-4 text-xs font-semibold text-forest-950 shadow-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {confirming ? (
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 size={14} aria-hidden="true" />
              )}
              <span>Delete</span>
              <span className="grid size-4.5 place-items-center rounded bg-forest-950/20 font-mono text-[11px] font-bold text-forest-950">
                {selectedTargets.length}
              </span>
            </button>
          </div>
        </div>

        {/* Everything the numbers above cannot say on their own, in one muted
            block rather than scattered between them. */}
        <div className="mt-2 grid gap-1 text-xs text-mist-500">
          <p>
            {permanent ? (
              <span className="font-medium text-coral-300">
                Selected targets are deleted permanently. Not recoverable.
              </span>
            ) : (
              <span>Selected targets move to the Recycle Bin. Restorable from there if needed.</span>
            )}
          </p>

          {unreadable > 0 && (
            <p className="text-confidence-medium" title="Grant Uncached Full Disk Access to read them.">
              {unreadable} {unreadable === 1 ? "folder was" : "folders were"} withheld by the system,
              so the count and the total above are both a floor.
            </p>
          )}

          {activeIgnoreRules > 0 && (
            <p>
              {activeIgnoreRules === 1 ? "1 ignore rule is" : `${activeIgnoreRules} ignore rules are`} in
              force. Covered paths were excluded from this scan.
            </p>
          )}
        </div>
      </header>

      {targets.length === 0 ? (
        <div className="my-5 grid min-h-52 flex-1 place-items-center rounded-2xl border border-forest-800 bg-forest-900 px-6 py-10 text-center">
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
            {failed.length > 0 && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-3 rounded-2xl border border-coral-300/40 bg-coral-surface px-4 py-3 text-xs leading-5 text-coral-300"
              >
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 select-text">
                  <p className="font-semibold">
                    {failed.length === 1
                      ? "One target was not removed."
                      : `${failed.length} targets were not removed.`}{" "}
                    {error ?? "The system refused the removal."}
                  </p>
                  <p className="mt-1 text-coral-300/80">
                    {failed.length === 1 ? "It is" : "They are"} still selected, so pressing again
                    once the reason is gone retries {failed.length === 1 ? "it" : "them"}.
                  </p>
                </div>
              </div>
            )}
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
            {/* One card holding rows, the way the project list is drawn. A
                stack of separately bordered cards puts a border around every
                row inside a scroller that already has one. */}
            <div className="overflow-hidden rounded-2xl border border-forest-800 bg-forest-900 shadow-xs">
              {/* Select-all belongs to the list, in the list, with its box in
                  the same column as the boxes it toggles. Standing in a bar of
                  its own it was a control pointing at nothing near it. The
                  order toggle rides the same row rather than earning a second
                  strip for two buttons. */}
              <div className="flex items-center border-b border-forest-800 bg-forest-950/40">
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={scanning || freeTargets.length === 0}
                  className="group/all flex min-w-0 items-center gap-3.5 px-4 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-md border transition-all ${
                      allSelected
                        ? "border-sage-400 bg-sage-400 text-forest-950"
                        : "border-forest-800 bg-forest-950 text-transparent group-hover/all:border-sage-400"
                    }`}
                  >
                    <Check size={11} strokeWidth={3} aria-hidden="true" />
                  </span>
                  <span className="truncate text-xs font-medium text-mist-300">
                    {allSelected ? "Deselect all" : "Select all"}
                    {selectedTargets.length > 0 && (
                      <span className="ml-1.5 font-mono text-[11px] text-mist-500">
                        {selectedTargets.length} of {freeTargets.length}
                      </span>
                    )}
                  </span>
                </button>

                {heldSelection.length > 0 && (
                  <span
                    title={heldSelection.map((target) => target.path).join("\n")}
                    className="ml-3 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-coral-300/40 bg-coral-surface px-2 py-1 font-mono text-[10px] text-coral-300"
                  >
                    <Radio size={10} aria-hidden="true" />
                    {heldSelection.length} in {heldSelection.length === 1 ? "a project" : "projects"} that {heldSelection.length === 1 ? "is" : "are"} running — {heldSelection.length === 1 ? "it will" : "they will"} not be removed
                  </span>
                )}

                <div className="flex-1" aria-hidden="true" />

                {/* The order was the product's opinion and nothing said so,
                    which left the least certain target at the top for no
                    visible reason and the heaviest one unreachable. */}
                {targets.length > 1 && (
                  <div className="pr-3">
                    <ChoiceRow
                      active={order}
                      onChange={setOrder}
                      options={[
                        [
                          "confidence",
                          "Least certain",
                          proEnabled
                            ? "Targets the scanner is least sure about come first"
                            : "Targets the scanner is least sure about come first. On Free, what your plan can clean leads either way.",
                        ],
                        [
                          "size",
                          "Largest",
                          proEnabled
                            ? "Heaviest on disk first"
                            : "Heaviest on disk first. On Free, what your plan can clean leads either way.",
                        ],
                      ]}
                    />
                  </div>
                )}
              </div>

              {listedTargets.map((target, position) => (
                <TargetCard
                  key={target.id}
                  target={target}
                  first={position === 0}
                  isCleaning={cleaningTargetIds.has(target.id)}
                  selected={selectedIds.has(target.id)}
                  onToggle={toggleTarget}
                  onRefreshSize={refreshTargetSize}
                  proEnabled={proEnabled}
                />
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
                      className="mt-2 w-full rounded-xl border bg-forest-950 px-3 py-2.5 font-mono text-sm text-mist-100 outline-none focus:border-coral-300"
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
                    className="rounded-xl bg-coral-300 px-4 py-2.5 text-sm font-semibold text-forest-950 hover:opacity-90 disabled:cursor-not-allowed"
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
