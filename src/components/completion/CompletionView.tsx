import { useEffect } from "react";
import confetti from "canvas-confetti";
import { Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Step } from "../../types/scan";
import { formatBytes } from "../../utils/format";

interface CompletionViewProps {
  step: Step;
  cleanupSummary: {
    removed: number;
    freedBytes: number;
  };
  resetScan: () => void;
}

export function CompletionView({ step, cleanupSummary, resetScan }: CompletionViewProps) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (step !== 4 || reducedMotion) return;

    const burst = (origin: { x: number; y: number }, angle: number) => {
      void confetti({
        particleCount: 55,
        angle,
        spread: 62,
        startVelocity: 30,
        gravity: 1.1,
        ticks: 180,
        origin,
        colors: ["#b9d98d", "#ffc2b5", "#edf0eb"],
        disableForReducedMotion: true,
        zIndex: 100,
      });
    };

    const timers = [
      window.setTimeout(() => burst({ x: 0.5, y: 0.62 }, 90), 0),
      window.setTimeout(() => burst({ x: 0.18, y: 0.7 }, 55), 300),
      window.setTimeout(() => burst({ x: 0.82, y: 0.7 }, 125), 600),
    ];

    return () => timers.forEach(window.clearTimeout);
  }, [reducedMotion, step]);

  return (
    <AnimatePresence mode="wait">
      {step === 4 && (
        <motion.section
          key="complete"
          initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="col-span-full w-full flex min-h-0 flex-col items-center justify-center text-center"
        >
          <motion.div
            initial={reducedMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            className="grid size-20 place-items-center rounded-full border border-sage-400/40 bg-sage-400/10 text-sage-300"
          >
            <Check size={38} strokeWidth={1.6} aria-hidden="true" />
          </motion.div>

          <h1 className="mt-6 text-4xl font-semibold tracking-tighter text-mist-100">
            Cleanup complete.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-mist-500">
            Your workspace has more room for what matters.
          </p>

          <div className="mt-8 flex gap-3">
            <div className="rounded-2xl border border-forest-800 bg-forest-900 px-5 py-4 text-left">
              <span className="block text-xs uppercase tracking-[0.14em] text-mist-500">Removed</span>
              <strong className="mt-1 block text-2xl text-mist-100">{cleanupSummary.removed}</strong>
            </div>
            <div className="rounded-2xl border border-forest-800 bg-forest-900 px-5 py-4 text-left">
              <span className="block text-xs uppercase tracking-[0.14em] text-mist-500">Space reclaimed</span>
              <strong className="mt-1 block text-2xl text-sage-300">
                {formatBytes(cleanupSummary.freedBytes)}
              </strong>
            </div>
          </div>

          <button
            type="button"
            onClick={resetScan}
            className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-sage-400 px-5 text-sm font-semibold text-forest-950 hover:bg-sage-300"
          >
            Scan another workspace
          </button>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
