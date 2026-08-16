import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** How long after launch the first check waits. */
const SETTLE = 8000;

/** How often a window left open asks again. */
const AGAIN = 6 * 60 * 60 * 1000;

export type UpdateStage = "idle" | "checking" | "available" | "downloading" | "ready" | "failed";

export type UpdateState = {
  stage: UpdateStage;
  /** The version being offered, once there is one. */
  version: string | null;
  notes: string | null;
  /** 0 to 1 while downloading, or null when the server sent no length. */
  progress: number | null;
  /** Why the last attempt failed, for the one place that shows it. */
  problem: string | null;
  /** True while a check the user asked for is running. */
  asked: boolean;
  check: (asked?: boolean) => Promise<void>;
  install: () => Promise<void>;
};

/**
 * Whether there is a newer Uncached, and putting it in place.
 *
 * **Nothing here interrupts.** No modal, no download that starts itself: an app
 * whose job is to be trusted with deleting directories does not get to seize
 * the window to talk about itself. The check is quiet, the offer sits in the
 * corner, and both the download and the restart are asked for.
 *
 * **Never while the app is working.** Replacing the binary under a running scan
 * or cleanup is the one bug this feature could introduce that matters — a
 * half-moved directory whose mover no longer exists. `busy` is the same signal
 * the workspace watcher refuses on, and it gates the install rather than the
 * check, because knowing costs nothing and only replacing is dangerous.
 *
 * The version comparison is the plugin's, against what the manifest says. This
 * hook never decides that a version is newer — a string comparison written here
 * would be a second, worse answer to a question already answered correctly.
 */
export function useUpdate({ busy }: { busy: boolean }): UpdateState {
  const [stage, setStage] = useState<UpdateStage>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  // Held rather than stored: it carries a native handle, and re-rendering on it
  // would say nothing the stage does not already say.
  const pending = useRef<Update | null>(null);
  const busyNow = useRef(busy);
  busyNow.current = busy;

  const run = useCallback(async (byHand = false) => {
    if (!isTauri()) return;
    setAsked(byHand);
    setProblem(null);
    setStage("checking");
    try {
      const update = await check();
      if (!update) {
        pending.current = null;
        setStage("idle");
        return;
      }
      pending.current = update;
      setVersion(update.version);
      setNotes(update.body ?? null);
      setStage("available");
    } catch (error) {
      // Said, not swallowed. An update that cannot be reached is ordinary — a
      // firewall, a plane, a CDN having a bad day — and it is only worth a
      // sentence where somebody went looking. It never reaches the workspace.
      pending.current = null;
      setProblem(describe(error));
      setStage("failed");
    } finally {
      setAsked(false);
    }
  }, []);

  const install = useCallback(async () => {
    const update = pending.current;
    if (!update) return;
    if (busyNow.current) {
      setProblem("Uncached is working — this will wait until it has finished");
      return;
    }
    setProblem(null);
    setProgress(null);
    setStage("downloading");
    try {
      let total = 0;
      let taken = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          taken += event.data.chunkLength;
          setProgress(total > 0 ? Math.min(1, taken / total) : null);
        }
      });
      setStage("ready");
    } catch (error) {
      setProblem(describe(error));
      setStage("failed");
    }
  }, []);

  // Not at launch. The first seconds belong to reading the workspace, and an
  // update check competing with that trades the thing the user opened the app
  // for against news they did not ask for.
  useEffect(() => {
    if (!isTauri()) return;
    const first = setTimeout(() => void run(), SETTLE);
    const again = setInterval(() => void run(), AGAIN);
    return () => {
      clearTimeout(first);
      clearInterval(again);
    };
  }, [run]);

  return {
    stage,
    version,
    notes,
    progress,
    problem,
    asked,
    check: run,
    install: async () => {
      if (stage === "ready") {
        await relaunch();
        return;
      }
      await install();
    },
  };
}

function describe(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "The update could not be reached";
}
