import { Ban, LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ScanProgress, ScanTarget, Step } from "../../types/scan";

interface ScanViewProps {
  step: Step;
  scanning: boolean;
  cancelling: boolean;
  targets: ScanTarget[];
  progress: ScanProgress | null;
  cancelScan: () => void;
}

export function ScanView({
  step,
  scanning,
  cancelling,
  targets,
  progress,
  cancelScan,
}: ScanViewProps) {
  const reducedMotion = useReducedMotion();

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
          {scanning ? "Scanning workspace" : "Measuring targets"}
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-mist-500 max-w-lg">
          {scanning
            ? "Targets are measured as they are found."
            : "Computing size on disk for each target."}
        </p>

        <div className="mt-8 flex min-h-16 items-center justify-center gap-12 px-4 py-3 text-center">
          <div>
            <strong className="block font-mono text-2xl font-medium tracking-tight text-sage-300">{progress?.directoriesScanned.toLocaleString() ?? "0"}</strong>
            <span className="mt-1 block font-sans text-xs text-mist-500">directories checked</span>
          </div>
          <div>
            <strong className="block font-mono text-2xl font-medium tracking-tight text-sage-300">{targets.length}</strong>
            <span className="mt-1 block font-sans text-xs text-mist-500">
              {targets.length === 1 ? "target found" : "targets found"}
            </span>
          </div>
        </div>

        {/* Cancel is offered only while there is a scan to cancel. */}
        <div className="mt-8 flex min-h-9 items-center">
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
