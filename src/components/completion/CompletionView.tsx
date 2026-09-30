import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { Step } from "../../types/scan";
import type { CleanMode } from "../../types/settings";
import { formatBytes } from "../../utils/format.mjs";

interface CompletionViewProps {
  step: Step;
  cleanupSummary: {
    removed: number;
    freedBytes: number;
  };
  cleanupMode: CleanMode;
  resetScan: () => void;
  /** Absent when no folder is chosen, which leaves nothing to return to. */
  backToWorkspace?: () => void;
}

export function CompletionView({ step, cleanupSummary, cleanupMode, resetScan, backToWorkspace }: CompletionViewProps) {
  const reducedMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { t } = useTranslation();
  const copy = {
    result: t("findings.completion.result", {
      count: cleanupSummary.removed,
      size: formatBytes(cleanupSummary.freedBytes),
    }),
    recovery: cleanupMode === "Permanent"
      ? t("findings.completion.recoveryPermanent")
      : t("findings.completion.recoveryRecycle"),
  };

  useEffect(() => {
    if (step !== 4) return;
    window.requestAnimationFrame(() => headingRef.current?.focus());

    if (reducedMotion || cleanupSummary.removed === 0) return;

    const burst = (origin: { x: number; y: number }, angle: number) => {
      void confetti({
        particleCount: 28,
        angle,
        spread: 48,
        startVelocity: 22,
        gravity: 1.2,
        ticks: 120,
        origin,
        colors: ["#f5c518", "#ffd83d", "#ff7a4d", "#f5f3e8"],
        disableForReducedMotion: true,
        zIndex: 100,
      });
    };

    const timers = [
      window.setTimeout(() => burst({ x: 0.5, y: 0.68 }, 90), 0),
      window.setTimeout(() => burst({ x: 0.28, y: 0.72 }, 65), 700),
      window.setTimeout(() => burst({ x: 0.72, y: 0.72 }, 115), 1400),
    ];

    return () => timers.forEach(window.clearTimeout);
  }, [cleanupSummary.removed, reducedMotion, step]);

  return (
    <AnimatePresence mode="wait">
      {step === 4 && (
        <motion.section
          key="complete"
          initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          aria-labelledby="cleanup-complete-title"
          className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center text-center"
        >
          <motion.div
            initial={reducedMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            className="grid size-20 place-items-center rounded-full border border-sage-400/40 bg-sage-400/10 text-sage-300"
          >
            <Check size={38} strokeWidth={1.6} aria-hidden="true" />
          </motion.div>

          <h1
            id="cleanup-complete-title"
            ref={headingRef}
            tabIndex={-1}
            className="mt-6 text-4xl font-semibold tracking-tighter text-mist-100 outline-none focus-visible:ring-2 focus-visible:ring-sage-400/60 focus-visible:ring-offset-4 focus-visible:ring-offset-forest-950"
          >
            {t("findings.completion.title")}
          </h1>
          <p aria-live="polite" className="mt-3 max-w-sm text-sm leading-6 text-mist-500">
            {copy.result}
          </p>
          <p className="mt-2 max-w-sm text-xs leading-5 text-mist-500">
            {copy.recovery}
          </p>

          <div className="mt-8 flex gap-3">
            <div className="rounded-2xl border border-forest-800 bg-forest-900 px-5 py-4 text-start">
              <span className="block text-xs uppercase tracking-[0.14em] text-mist-500">{t("findings.completion.targetsRemoved")}</span>
              <strong className="mt-1 block text-2xl text-mist-100">{cleanupSummary.removed}</strong>
            </div>
            <div className="rounded-2xl border border-forest-800 bg-forest-900 px-5 py-4 text-start">
              <span className="block text-xs uppercase tracking-[0.14em] text-mist-500">{t("findings.completion.spaceReclaimed")}</span>
              <strong className="mt-1 block text-2xl text-sage-300">
                {formatBytes(cleanupSummary.freedBytes)}
              </strong>
            </div>
          </div>

          {/* The workspace is where the user came from and where the result is
              now visible, so it leads. Reading it again is part of going back:
              the map still holds the weights these targets used to occupy. */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {backToWorkspace && (
              <button
                type="button"
                onClick={backToWorkspace}
                className="inline-flex min-h-11 items-center rounded-xl bg-sage-400 px-5 text-sm font-semibold text-forest-950 hover:bg-sage-300"
              >
                {t("findings.backToWorkspace")}
              </button>
            )}
            <button
              type="button"
              onClick={resetScan}
              className={`inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-medium transition-colors ${
                backToWorkspace
                  ? "bg-forest-800 text-mist-300 hover:bg-forest-850 hover:text-sage-300"
                  : "bg-sage-400 font-semibold text-forest-950 hover:bg-sage-300"
              }`}
            >
              {t("findings.completion.scanAnother")}
            </button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
