import type { FormEvent } from "react";
import { AlertTriangle, Ban, LoaderCircle, ScanSearch } from "lucide-react";
import { RootPicker } from "../shared/RootPicker";
import { SearchPanel } from "../shared/SearchPanel";
import { motion, useReducedMotion } from "motion/react";
import type { Step } from "../../types/scan";
import type { LastCleanup } from "../../types/settings";
import { formatBytes } from "../../utils/format";

interface WorkspaceFormProps {
  step: Step;
  extraRoots: string[];
  removeRoot: (path: string) => void;
  pickRoot: () => void;
  proEnabled: boolean;
  startScan: (event: FormEvent) => void;
  cancelScan: () => void;
  listenersReady: boolean;
  scanning: boolean;
  cancelling: boolean;
  status: string;
  cleanupSummary: { removed: number; freedBytes: number };
  lastCleanup: LastCleanup | null;
  error: string | null;
}

export function WorkspaceForm({
  step,
  extraRoots,
  removeRoot,
  pickRoot,
  proEnabled,
  startScan,
  cancelScan,
  listenersReady,
  scanning,
  cancelling,
  status,
  cleanupSummary,
  lastCleanup,
  error,
}: WorkspaceFormProps) {
  const reducedMotion = useReducedMotion();

  const lastRun = cleanupSummary.removed > 0 ? cleanupSummary : lastCleanup;
  const statusLine = scanning
    ? status
    : lastRun
      ? `Last run: ${lastRun.removed} ${lastRun.removed === 1 ? "target" : "targets"} removed, ${formatBytes(lastRun.freedBytes)} reclaimed`
      : status === "Scan cancelled"
        ? status
        : null;

  if (step !== 1) return null;

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full w-full flex-col justify-center"
    >
      <SearchPanel
        title="Reclaim disk from build artifacts."
        subtitle="Finds dependency, build, and cache directories your toolchains can regenerate."
      >
        <form onSubmit={startScan} className="w-full">
          <RootPicker
            roots={extraRoots}
            onPick={pickRoot}
            onRemove={removeRoot}
            proEnabled={proEnabled}
          />

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={!listenersReady || scanning || extraRoots.length === 0}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-sage-400 px-5 text-sm font-semibold text-forest-950 transition-colors hover:bg-sage-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {scanning ? (
                <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
              ) : (
                <ScanSearch size={17} aria-hidden="true" />
              )}
              <span>{scanning ? "Scanning workspace..." : "Scan workspace"}</span>
            </button>

            {scanning && (
              <button
                type="button"
                disabled={cancelling}
                onClick={cancelScan}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-coral-300 px-4 text-sm font-semibold text-forest-950 transition-colors hover:opacity-90 disabled:cursor-not-allowed"
              >
                <Ban size={16} aria-hidden="true" />
                <span>{cancelling ? "Cancelling..." : "Cancel"}</span>
              </button>
            )}
          </div>

          <div className="mt-4 flex min-h-6 items-center justify-center gap-2 text-xs text-mist-500" aria-live="polite">
            {scanning && <LoaderCircle size={14} className="animate-spin text-sage-400" aria-hidden="true" />}
            {statusLine === "Scan cancelled" && <Ban size={14} className="text-coral-300" aria-hidden="true" />}
            {statusLine && <span>{statusLine}</span>}
          </div>
        </form>

        {error && (
          <div
            className="mt-6 flex w-full items-start gap-3 rounded-2xl border border-coral-300/40 bg-forest-900 p-4 text-left text-sm text-coral-300"
            role="alert"
          >
            <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </SearchPanel>
    </motion.section>
  );
}
