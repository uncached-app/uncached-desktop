import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, FolderSearch, LoaderCircle, Radio, Trash2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Trans, useTranslation } from "react-i18next";
import type { CleanResult, ScanTarget, Step } from "../../types/scan";
import type { CleanMode } from "../../types/settings";
import type { RunningProject } from "../../types/workspace";
import { formatBytes } from "../../utils/format.mjs";
import { isInside } from "../../utils/paths.mjs";
import {
  filterByAge,
  getCleanupReadyTargets,
  holdsNothing,
  keepAvailableIds,
  keepAvailableTargets,
  listReportedOnly,
  sortForListing,
} from "../../utils/scanReview.mjs";
import type { ListOrder } from "../../utils/scanReview.d.mts";
import { isFreeTarget, summarizePlans } from "../../utils/entitlements.mjs";
import { ReportedOnlyList } from "./ReportedOnlyList";
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

/** Typed verbatim to confirm a permanent delete, in every language. */
const CONFIRMATION_WORD = "Nuke";

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
  // Least certain first, and everything regardless of age: both are what the
  // screen opens on, and neither is remembered — a filter that outlives the
  // visit is one somebody is left wondering about when the list looks short.
  const [minAgeDays, setMinAgeDays] = useState(0);
  // Every count, total, selection and listing below derives from this set.
  const targets = filterByAge(
    scannedTargets.filter((target) => !holdsNothing(target)),
    minAgeDays,
  );
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
  const reportedOnly = listReportedOnly(targets);
  const freeTargets = proEnabled ? readyTargets : readyTargets.filter(isFreeTarget);
  const selectedTargets = freeTargets.filter((target) => selectedIds.has(target.id));
  const allSelected = freeTargets.length > 0 && selectedTargets.length === freeTargets.length;
  const deleteDisabled = scanning || confirming || deleting || selectedTargets.length === 0 || !cleanupModeSupported;
  const reducedMotion = useReducedMotion();
  const permanent = cleanMode === "Permanent";
  const confirmationReady = !permanent || confirmation === CONFIRMATION_WORD;
  const { t } = useTranslation();
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
    setSelectedIds((current) => keepAvailableIds(current, available));
    // A target that is gone is one that was removed, so a refusal about it is
    // no longer true.
    setFailed((current) => keepAvailableTargets(current, available));
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
      aria-label={t("findings.section.label")}
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
            <ArrowLeft size={13} className="rtl:-scale-x-100 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
            <span>{t("findings.breadcrumb.workspace")}</span>
          </button>
          <span className="opacity-40">/</span>
          <span className="truncate font-mono text-[11px] text-mist-300">{t("findings.breadcrumb.current")}</span>
        </div>

        {/* Laid out like the workspace header, because they are the same kind
            of screen: what it adds up to on the left, the one destructive
            action pinned top-right, and the controls in a bar of their own
            underneath. The two used to diverge in type scale, in how a figure
            was drawn, and in whether the order control sat inside a bordered
            box of its own — a card inside a card. */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <h1 className="me-1 shrink-0 text-xl font-bold tracking-tight text-mist-100 sm:text-2xl">
              {t("findings.header.targets", { count: targets.length })}
            </h1>

            {readyTargets.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <StatCard
                  value={formatBytes(totalBytesFound)}
                  label={t("findings.header.reclaimable")}
                  /* The heading counts every target; this covers only the ones
                     a reclaim could take. Side by side with nothing between
                     them the two numbers describe different sets and read as
                     one claim. */
                  title={
                    readyTargets.length < targets.length
                      ? t("findings.header.reclaimableScope", { ready: readyTargets.length, count: targets.length })
                      : undefined
                  }
                />

                {selectedTargets.length > 0 && (
                  <StatCard
                    value={formatBytes(selectedBytes)}
                    label={t("findings.header.selected", { count: selectedTargets.length })}
                    accent
                  />
                )}

                {inUse.length > 0 && (
                  <span
                    title={inUse
                      .map((target) =>
                        t("findings.header.inUseTarget", {
                          name: target.label ?? target.name,
                          tool: target.blockedBy,
                        }),
                      )
                      .join("\n")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-coral-300/40 bg-coral-surface px-3 py-1.5 font-mono text-[11px] text-coral-300"
                  >
                    <Radio size={11} aria-hidden="true" />
                    {t("findings.header.inUse", {
                      size: formatBytes(inUse.reduce((sum, target) => sum + target.sizeBytes, 0)),
                    })}
                  </span>
                )}

                {!proEnabled && (
                  <span className="rounded-xl border border-forest-800 bg-forest-900 px-3 py-1.5 font-mono text-[11px] text-mist-500">
                    {t("findings.header.planFree", { size: formatBytes(freeBytes) })}
                    {proBytes > 0 && (
                      <span className="text-pro-100"> · {t("findings.header.planPro", { size: formatBytes(proBytes) })}</span>
                    )}
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
                  : t("findings.delete.unsupported")
              }
              className="group inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-coral-300 px-4 text-xs font-semibold text-forest-950 shadow-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {confirming ? (
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 size={14} aria-hidden="true" />
              )}
              <span>{permanent ? t("findings.delete.button") : t("findings.delete.buttonTrash")}</span>
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
              <span className="font-medium text-coral-300">{t("findings.notice.permanent")}</span>
            ) : (
              <span>{t("findings.notice.recycle")}</span>
            )}
          </p>

          {unreadable > 0 && (
            <p className="text-confidence-medium" title={t("findings.notice.unreadableHint")}>
              {t("findings.notice.unreadable", { count: unreadable })}
            </p>
          )}

          {activeIgnoreRules > 0 && (
            <p>{t("findings.notice.ignoreRules", { count: activeIgnoreRules })}</p>
          )}
        </div>
      </header>

      {targets.length === 0 ? (
        <div className="my-5 grid min-h-52 flex-1 place-items-center rounded-2xl border border-forest-800 bg-forest-900 px-6 py-10 text-center">
          <div>
            <FolderSearch size={32} className="mx-auto text-mist-500" strokeWidth={1.5} aria-hidden="true" />
            <p className="mt-4 text-sm font-medium text-mist-300">
              {scanning ? t("findings.empty.scanning") : t("findings.empty.none")}
            </p>
            <p className="mt-1 text-sm text-mist-500">
              {scanning
                ? t("findings.empty.scanningHint")
                : minAgeDays > 0
                  ? t("findings.empty.tooRecent", { count: minAgeDays })
                  : t("findings.empty.settingsHint")}
            </p>
            {!scanning && minAgeDays > 0 && (
              <button
                type="button"
                onClick={() => setMinAgeDays(0)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-mist-300 hover:bg-forest-850 hover:text-sage-300"
              >
                {t("findings.empty.showEveryAge")}
              </button>
            )}
            {!scanning && minAgeDays === 0 && (
              <button
                type="button"
                onClick={onBack}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-mist-300 hover:bg-forest-850 hover:text-sage-300"
              >
                <ArrowLeft className="rtl:-scale-x-100" size={15} aria-hidden="true" />
                {t("findings.backToWorkspace")}
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
          <div className="h-full overflow-y-auto pe-1.5 pt-5 pb-8">
            {failed.length > 0 && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-3 rounded-2xl border border-coral-300/40 bg-coral-surface px-4 py-3 text-xs leading-5 text-coral-300"
              >
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 select-text">
                  <p className="font-semibold">
                    {t("findings.failed.title", { count: failed.length })}{" "}
                    {error ?? t("findings.failed.refused")}
                  </p>
                  <p className="mt-1 text-coral-300/80">
                    {t("findings.failed.retry", { count: failed.length })}
                  </p>
                </div>
              </div>
            )}
            {!proEnabled && proBytes > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pro-200/30 bg-pro-surface px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-mist-100">
                    {t("findings.pro.more", { size: formatBytes(proBytes) })}
                  </p>
                  <p className="mt-1 text-xs text-mist-500">{t("findings.pro.pitch")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openExternalUrl("https://uncached.app/pro")}
                  className="rounded-xl bg-pro-200 px-3 py-2 text-xs font-semibold text-forest-950 transition-colors hover:bg-pro-100"
                >
                  {t("findings.pro.cta")}
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
                  className="group/all flex min-w-0 items-center gap-3.5 px-4 py-2.5 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-40"
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
                    {allSelected ? t("findings.list.deselectAll") : t("findings.list.selectAll")}
                    {selectedTargets.length > 0 && (
                      <span className="ms-1.5 font-mono text-[11px] text-mist-500">
                        {t("findings.list.selectedOf", {
                          selected: selectedTargets.length,
                          total: freeTargets.length,
                        })}
                      </span>
                    )}
                  </span>
                </button>

                {heldSelection.length > 0 && (
                  <span
                    title={heldSelection.map((target) => target.path).join("\n")}
                    className="ms-3 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-coral-300/40 bg-coral-surface px-2 py-1 font-mono text-[10px] text-coral-300"
                  >
                    <Radio size={10} aria-hidden="true" />
                    {t("findings.list.heldByRunning", { count: heldSelection.length })}
                  </span>
                )}

                <div className="flex-1" aria-hidden="true" />

                {/* The order was the product's opinion and nothing said so,
                    which left the least certain target at the top for no
                    visible reason and the heaviest one unreachable. */}
                <div role="group" aria-label={t("findings.age.label")} className="flex items-center gap-2 pe-3">
                  <span className="text-[11px] text-mist-500">{t("findings.age.label")}</span>
                  <ChoiceRow
                    active={minAgeDays}
                    onChange={setMinAgeDays}
                    options={[
                      [0, t("findings.age.any"), t("findings.age.anyHint")],
                      [30, t("findings.age.olderThan", { days: 30 }), t("findings.age.monthHint")],
                      [90, t("findings.age.olderThan", { days: 90 }), t("findings.age.threeMonthsHint")],
                    ]}
                  />
                </div>

                {targets.length > 1 && (
                  <div role="group" aria-label={t("findings.order.label")} className="flex items-center gap-2 pe-3">
                    <span className="text-[11px] text-mist-500">{t("findings.order.label")}</span>
                    <ChoiceRow
                      active={order}
                      onChange={setOrder}
                      options={[
                        [
                          "confidence",
                          t("findings.order.confidence.label"),
                          proEnabled
                            ? t("findings.order.confidence.hint")
                            : t("findings.order.confidence.hintFree"),
                        ],
                        [
                          "size",
                          t("findings.order.size.label"),
                          proEnabled
                            ? t("findings.order.size.hint")
                            : t("findings.order.size.hintFree"),
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
            <ReportedOnlyList targets={reportedOnly} />
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
                    {deleting
                      ? permanent
                        ? t("findings.confirm.deleting")
                        : t("findings.confirm.moving")
                      : permanent
                        ? t("findings.confirm.deletePermanently")
                        : t("findings.confirm.moveToRecycleBin")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-mist-500">
                    {deleting
                      ? permanent
                        ? t("findings.confirm.deletingProgress", { count: selectedTargets.length })
                        : t("findings.confirm.movingProgress", { count: selectedTargets.length })
                      : permanent
                        ? t("findings.confirm.permanentWarning", { count: selectedTargets.length })
                        : t("findings.confirm.recycleWarning", { count: selectedTargets.length })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="grid size-8 place-items-center rounded-lg text-mist-500 hover:bg-forest-800 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={t("findings.confirm.close")}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>
              {!deleting && <>
                <p className="mt-5 rounded-xl border border-forest-800 bg-forest-950 px-4 py-3 text-sm text-mist-300">
                  <Trans
                    i18nKey="findings.confirm.reclaims"
                    values={{ size: formatBytes(selectedBytes) }}
                    components={{ strong: <strong className="text-mist-100" /> }}
                  />
                </p>
                {permanent && (
                  <label className="mt-4 block text-start text-sm text-mist-300">
                    <Trans
                      i18nKey="findings.confirm.typeToConfirm"
                      values={{ word: CONFIRMATION_WORD }}
                      components={{ strong: <strong className="font-mono text-coral-300" /> }}
                    />
                    <input
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      className="mt-2 w-full rounded-xl border bg-forest-950 px-3 py-2.5 font-mono text-sm text-mist-100 outline-none focus:border-coral-300"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={t("findings.confirm.inputLabel")}
                    />
                  </label>
                )}
              </>}
              <div className="mt-6 flex justify-end gap-3">
                {deleting ? <button type="button" disabled className="inline-flex items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-mist-300"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> {t("findings.confirm.cleaning")}</button> : <>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm text-mist-300 hover:bg-forest-850"
                  >
                    {t("findings.confirm.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    disabled={!confirmationReady || selectedTargets.length === 0 || !cleanupModeSupported}
                    className="rounded-xl bg-coral-300 px-4 py-2.5 text-sm font-semibold text-forest-950 hover:opacity-90 disabled:cursor-not-allowed"
                  >
                    {permanent ? t("findings.confirm.deletePermanently") : t("findings.confirm.moveToRecycleBin")}
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
