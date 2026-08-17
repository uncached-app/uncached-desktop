import type { FormEvent } from "react";
import { AlertTriangle, Ban, ScanSearch } from "lucide-react";
import { RootPicker } from "../shared/RootPicker";
import { SearchPanel } from "../shared/SearchPanel";
import { motion, useReducedMotion } from "motion/react";
import type { ScanNotice, Step } from "../../types/scan";
import type { LastCleanup } from "../../types/settings";
import { formatBytes } from "../../utils/format.mjs";

interface WorkspaceFormProps {
  step: Step;
  extraRoots: string[];
  removeRoot: (path: string) => void;
  pickRoot: () => void;
  proEnabled: boolean;
  /** Reads the projects and opens the workspace. The artifact walk is Reclaim's. */
  openWorkspace: (event: FormEvent) => void;
  listenersReady: boolean;
  notice: ScanNotice | null;
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
  openWorkspace,
  listenersReady,
  notice,
  cleanupSummary,
  lastCleanup,
  error,
}: WorkspaceFormProps) {
  const reducedMotion = useReducedMotion();

  const lastRun = cleanupSummary.removed > 0 ? cleanupSummary : lastCleanup;
  // A cancellation outranks the last run: it is what just happened, and it used
  // to be hidden by it — the previous cleanup is remembered across restarts, so
  // "Last run" was almost always there to mask it.
  const cancelled = notice?.kind === "cancelled" ? notice : null;
  const statusLine = cancelled
    ? cancelled.targetsFound
      ? `Scan cancelled · ${cancelled.targetsFound} ${cancelled.targetsFound === 1 ? "target" : "targets"} found before stopping`
      : "Scan cancelled"
    : lastRun
      ? `Last run: ${lastRun.removed} ${lastRun.removed === 1 ? "target" : "targets"} removed, ${formatBytes(lastRun.freedBytes)} reclaimed`
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
        <form onSubmit={openWorkspace} className="w-full">
          <RootPicker
            roots={extraRoots}
            onPick={pickRoot}
            onRemove={removeRoot}
            proEnabled={proEnabled}
          />

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={!listenersReady || extraRoots.length === 0}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-sage-400 px-5 text-sm font-semibold text-forest-950 transition-colors hover:bg-sage-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ScanSearch size={17} aria-hidden="true" />
              <span>Open workspace</span>
            </button>
          </div>

          <div className="mt-4 flex min-h-6 items-center justify-center gap-2 text-xs text-mist-500" aria-live="polite">
            {cancelled && <Ban size={14} className="text-coral-300" aria-hidden="true" />}
            {statusLine && <span>{statusLine}</span>}
          </div>
        </form>

        {error && (
          <div
            className="select-text mt-6 flex w-full items-start gap-3 rounded-2xl border border-coral-300/40 bg-forest-900 p-4 text-left text-sm text-coral-300"
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
