import type { FormEvent } from "react";
import { AlertTriangle, Ban, FolderOpen, LoaderCircle, ScanSearch } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Step } from "../../types/scan";
import type { LastCleanup } from "../../types/settings";
import { formatBytes } from "../../utils/format";

interface WorkspaceFormProps {
  step: Step;
  rootPath: string;
  setRootPath: (path: string) => void;
  startScan: (event: FormEvent) => void;
  pickFolder: () => void;
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
  rootPath,
  setRootPath,
  startScan,
  pickFolder,
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
      className="flex h-full w-full flex-col items-center justify-center text-center px-4 py-8"
    >
      <div className="flex w-full max-w-3xl flex-col items-center">
        <h1 className="text-5xl font-semibold leading-[1.05] tracking-tighter text-mist-100">
          Reclaim disk from build artifacts.
        </h1>

        <p className="mt-3 max-w-xl text-base leading-relaxed text-mist-500">
          Finds dependency, build, and cache directories your toolchains can regenerate.
        </p>

        <form onSubmit={startScan} className="mt-6 w-full max-w-2xl">
          <div className="group relative flex items-center gap-2 rounded-2xl border border-forest-800 bg-forest-900 p-2 transition-colors focus-within:border-sage-400 focus-within:ring-2 focus-within:ring-sage-400/20 hover:border-sage-400/50">
            <FolderOpen size={18} className="ml-3 shrink-0 text-mist-500 transition-colors group-focus-within:text-sage-400" strokeWidth={1.8} aria-hidden="true" />
            
            <input
              id="root-path"
              className="min-w-0 flex-1 bg-transparent px-2 py-3 font-mono text-sm text-mist-100 outline-none placeholder:font-sans placeholder:text-mist-500/50"
              value={rootPath}
              onChange={(event) => setRootPath(event.currentTarget.value)}
              placeholder="Select or paste folder path..."
              spellCheck={false}
            />

            <button
              type="button"
              onClick={pickFolder}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-mist-300 transition-colors hover:bg-forest-850 hover:text-sage-300"
              aria-label="Browse for a folder"
            >
              <FolderOpen size={15} strokeWidth={1.8} aria-hidden="true" />
              <span>Browse</span>
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={!listenersReady || scanning || !rootPath.trim()}
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
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-coral-300 px-4 text-sm font-semibold text-forest-950 transition-colors hover:bg-coral-200 disabled:cursor-not-allowed disabled:bg-forest-800 disabled:text-mist-500"
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
      </div>
    </motion.section>
  );
}
