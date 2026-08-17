import { Ban, Info, LoaderCircle, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ScanNotice, ScanProgress, ScanTarget, Step } from "../../types/scan";

interface ScanViewProps {
  step: Step;
  scanning: boolean;
  cancelling: boolean;
  targets: ScanTarget[];
  progress: ScanProgress | null;
  cancelScan: () => void;
  /** What became of a Cancel the backend would not honour. */
  notice: ScanNotice | null;
  /** Returns to step 1 and abandons whatever this scan was still waiting on. */
  resetScan: () => void;
}

export function ScanView({
  step,
  scanning,
  cancelling,
  targets,
  progress,
  cancelScan,
  notice,
  resetScan,
}: ScanViewProps) {
  const reducedMotion = useReducedMotion();
  // Counted rather than tracked separately: a target stops being pending the
  // moment its size arrives, and that event is already being listened for.
  const measured = targets.filter((target) => !target.sizePending).length;
  // The walk through the chosen folders, and then the pass over the tool caches
  // in the home directory. The second reads a place nobody picked, so it says
  // so rather than arriving as more of the same walk.
  const caches = progress?.phase === "caches";
  const heading = !scanning
    ? "Measuring targets"
    : caches
      ? "Checking your tool caches"
      : "Scanning your projects";
  const subheading = !scanning
    ? "Computing size on disk for each target."
    : caches
      ? "Package manager, AI and editor caches in your home folder."
      : "Targets are measured as they are found.";
  // Newest first, and only the last few. What this answers is "is it finding
  // anything", which a name and the folder it sits in answer and a full path
  // set in a column this width does not.
  const recent = targets.slice(-5).reverse();

  if (step !== 2) return null;

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      aria-label={scanning ? "Scanning workspace" : "Measuring targets"}
      className="flex h-full w-full flex-col items-center justify-center text-center"
    >
      <div className="flex flex-col items-center max-w-md w-full">
        <div className="mb-7 grid size-16 place-items-center text-sage-300">
          <LoaderCircle size={42} className={reducedMotion ? "" : "animate-spin"} strokeWidth={1.5} aria-hidden="true" />
        </div>

        <h2 className="text-3xl font-semibold tracking-[-0.04em] text-mist-100 sm:text-4xl">
          {heading}
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-mist-500 max-w-lg">{subheading}</p>

        {/* The left figure changes with the phase, because the walk's own
            number stops the moment the walk does — and the measuring that
            follows it is the long part. Leaving `directories checked` frozen
            under the word "Measuring" is a screen insisting nothing is
            happening while the disk is at its busiest, which on Windows lasts
            long enough to look like a hang. */}
        <div className="mt-8 flex min-h-16 items-center justify-center gap-12 px-4 py-3 text-center">
          <div>
            <strong className="block font-mono text-2xl font-medium tracking-tight text-sage-300">
              {scanning && !caches ? (progress?.directoriesScanned.toLocaleString() ?? "0") : measured}
            </strong>
            <span className="mt-1 block font-sans text-xs text-mist-500">
              {scanning && !caches ? "directories checked" : "measured"}
            </span>
          </div>
          <div>
            <strong className="block font-mono text-2xl font-medium tracking-tight text-sage-300">{targets.length}</strong>
            <span className="mt-1 block font-sans text-xs text-mist-500">
              {targets.length === 1 ? "target found" : "targets found"}
            </span>
          </div>
        </div>

        {/* What it is finding, as it finds it.

            A pair of counters is a claim that something is happening; this is
            the evidence. It matters most in the second phase, where the paths
            are in the home directory rather than under anything the user chose
            — a screen that went quiet there read as a scan that had stopped. */}
        <ul
          aria-label="Recently found"
          aria-live="polite"
          className="mt-2 flex h-24 w-full flex-col items-center justify-start gap-1 overflow-hidden"
        >
          <AnimatePresence initial={false}>
            {recent.map((target, position) => (
              <motion.li
                key={target.id}
                layout={!reducedMotion}
                initial={reducedMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1 - position * 0.18, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex max-w-full items-baseline gap-2 truncate font-mono text-[11px] text-mist-500"
              >
                <span className="shrink-0 text-sage-300">{target.label ?? target.name}</span>
                <span className="truncate" dir="rtl">{target.path}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        {/* A Cancel reaches the backend after the walk has already ended more
            often than it looks: the button is live for the whole walk, and the
            walk ends on its own. The refusal used to produce nothing at all on
            screen, which reads as a broken button rather than a race lost. */}
        <div className="mt-6 flex min-h-5 items-center justify-center gap-2 text-xs text-mist-500" aria-live="polite">
          {notice?.kind === "cancelRefused" && (
            <>
              <Info size={13} className="shrink-0 text-mist-500" aria-hidden="true" />
              <span>The scan finished before it could be cancelled.</span>
            </>
          )}
        </div>

        {/* Cancel is offered only while there is a scan to cancel. Once the
            walk has ended this step is waiting for sizing to settle, and every
            way out of it depends on that happening — so if it does not, the
            screen had no control at all and no way back. Starting over is the
            honest offer there: it is not a cancellation, because there is
            nothing left running to cancel. */}
        <div className="mt-4 flex min-h-9 items-center">
          {!scanning && (
            <button
              type="button"
              onClick={resetScan}
              className="inline-flex items-center gap-2 rounded-xl border border-forest-800 bg-forest-900 px-4 py-2 text-xs font-semibold text-mist-300 transition-colors hover:bg-forest-850 hover:text-mist-100"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Start over
            </button>
          )}

          {scanning && (
            <button
              type="button"
              onClick={cancelScan}
              disabled={cancelling}
              className="inline-flex items-center gap-2 rounded-xl bg-coral-300 px-4 py-2 text-xs font-semibold text-forest-950 transition-colors hover:opacity-90 disabled:cursor-not-allowed"
            >
              <Ban size={14} aria-hidden="true" />
              <span>{cancelling ? "Cancelling..." : "Cancel scan"}</span>
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
