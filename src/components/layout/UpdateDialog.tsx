import { ArrowUpCircle, Loader2, RotateCw, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { UpdateState } from "../../hooks/useUpdate";

/**
 * The one place an update is read and taken.
 *
 * It used to live inside Settings > About, in a centred column capped at
 * `max-w-xs`, sharing that pane with the logo and the licence links. Release
 * notes are prose and that column is narrower than a sentence, so anything
 * longer than a line wrapped into a ribbon — and the download progress
 * appeared there too, behind two clicks, in a panel the reader had no reason
 * to keep open.
 *
 * **Opened, never sprung.** The toast and the titlebar badge stay exactly as
 * they were: quiet, ignorable, and never a window that takes over. What
 * changed is where their button leads. An app that deletes directories should
 * not teach that its dialogs appear on their own and can be dismissed without
 * reading — but a dialog the reader pressed for is the opposite of that, and
 * it is the only shape wide enough to show what is in a release before they
 * accept it.
 *
 * **Closing does not cancel.** The download lives in `useUpdate`, above this
 * component, so leaving puts it back in the badge and returning shows the same
 * progress. A dialog that abandoned a half-finished download because somebody
 * pressed Escape would be a worse promise than the cramped panel it replaces.
 */
export function UpdateDialog({
  update,
  open,
  onClose,
}: {
  update: UpdateState;
  open: boolean;
  onClose: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [installed, setInstalled] = useState<string | null>(null);

  // What is running now, so the two versions can be named. Read when the dialog
  // opens rather than held forever: it cannot change while the app is running,
  // and this is the only screen that says it out loud.
  useEffect(() => {
    if (!open || installed || !isTauri()) return;
    void invoke<{ version: string }>("get_app_info")
      .then((info) => setInstalled(info.version))
      .catch(() => { });
  }, [open, installed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // A check that runs behind this and finds nothing leaves `version` where it
  // was, so staying open would go on offering a release that is no longer on
  // the other end. Nothing to show is a reason to close, not to keep talking.
  useEffect(() => {
    if (open && update.stage === "idle") onClose();
  }, [open, update.stage, onClose]);

  const downloading = update.stage === "downloading";
  const ready = update.stage === "ready";
  // Reachable from here: "Try again" after a failure runs a fresh check, and
  // during it there is no version to name.
  const checking = update.stage === "checking";
  const percent = update.progress === null ? null : Math.round(update.progress * 100);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.15 }}
          // Above Settings, which is z-40: About is one of the places this
          // opens from, and a dialog behind the panel that summoned it would
          // be the bug this component exists to remove.
          className="fixed inset-0 z-50 grid place-items-center bg-forest-950/70 p-4 backdrop-blur-xs select-none"
          onClick={onClose}
        >
          {/* A covered drag region is not one; without this the window cannot
              be moved while the dialog is open. */}
          <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-12" />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Software update"
            onClick={(event) => event.stopPropagation()}
            initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex max-h-[min(560px,calc(100vh-32px))] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-forest-800 bg-forest-900 shadow-2xl"
          >
            <header className="flex shrink-0 items-start gap-3 border-b border-forest-800 px-6 py-5">
              <span className="mt-0.5 shrink-0 text-sage-300" aria-hidden="true">
                {downloading || checking ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : ready ? (
                  <RotateCw size={18} />
                ) : update.stage === "failed" ? (
                  <TriangleAlert size={18} className="text-coral-300" />
                ) : (
                  <ArrowUpCircle size={18} />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-mist-100">
                  {checking
                    ? "Looking for an update"
                    : ready
                      ? "Ready to restart"
                      : downloading
                        ? `Downloading Uncached ${update.version}`
                        : update.stage === "failed"
                          ? "The update could not be reached"
                          : `Uncached ${update.version} is available`}
                </h2>
                {installed && update.version && !checking && (
                  <p className="mt-1 font-mono text-[11px] text-mist-500">
                    {installed} → {update.version}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {update.stage === "failed" && update.problem ? (
                <p className="rounded-xl border border-coral-300/30 bg-coral-300/10 px-4 py-3 text-xs leading-5 text-coral-300 select-text">
                  {update.problem}
                </p>
              ) : checking ? (
                <p className="text-xs leading-5 text-mist-500">
                  Asking the update server what the newest release is.
                </p>
              ) : update.notes ? (
                // Given the width prose needs, and selectable: a release note
                // with a path or a flag in it is something people copy.
                <div className="whitespace-pre-line text-xs leading-6 text-mist-300 select-text">
                  {update.notes}
                </div>
              ) : (
                <p className="text-xs leading-5 text-mist-500">
                  This release came without notes.
                </p>
              )}
            </div>

            <footer className="shrink-0 border-t border-forest-800 px-6 py-4">
              {downloading && (
                // Indeterminate when the server sent no length, rather than a
                // bar at zero that reads as a stall.
                <div className="mb-4">
                  <div className="h-1 overflow-hidden rounded-full bg-forest-850">
                    <div
                      className={
                        percent === null
                          ? "h-full w-1/3 animate-pulse rounded-full bg-sage-400"
                          : "h-full rounded-full bg-sage-400 transition-[width] duration-300"
                      }
                      style={percent === null ? undefined : { width: `${percent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-mist-500">
                    {percent === null
                      ? "Downloading — the server did not say how large this is"
                      : `${percent}% — you can close this and it keeps going`}
                  </p>
                </div>
              )}

              {ready && (
                <p className="mb-4 text-[11px] leading-5 text-mist-500">
                  Uncached {update.version} is in place. Restarting takes a second and nothing
                  in your workspace is touched.
                </p>
              )}

              {update.problem && !downloading && update.stage !== "failed" && (
                <p className="mb-4 text-[11px] leading-5 text-mist-500">{update.problem}</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-mist-500 transition-colors hover:text-mist-100"
                >
                  {ready ? "Later" : downloading ? "Close" : "Not now"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void (update.stage === "failed" ? update.check(true) : update.install())
                  }
                  disabled={downloading || checking}
                  className="cursor-pointer rounded-lg bg-sage-400 px-3 py-1.5 text-xs font-semibold text-forest-950 transition-colors hover:bg-sage-300 disabled:cursor-default disabled:opacity-50"
                >
                  {checking
                    ? "Checking…"
                    : ready
                      ? "Restart now"
                      : downloading
                        ? "Downloading…"
                        : update.stage === "failed"
                          ? "Try again"
                          : "Download and install"}
                </button>
              </div>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
