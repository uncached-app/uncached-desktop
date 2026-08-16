import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** How long after launch the first check waits. */
const SETTLE = 8000;

/** How often a window left open asks again. */
const AGAIN = 6 * 60 * 60 * 1000;

/**
 * How soon a failed check is tried again.
 *
 * The first attempt lands eight seconds after launch, which on a laptop is
 * routinely before the network is up. One attempt and then six hours of
 * silence means an app opened at the start of the day never mentions an update
 * all morning — and says nothing about why, because a failed check is
 * deliberately quiet.
 */
const RETRY = 45 * 1000;

/**
 * How many times in a row that is worth doing.
 *
 * Without a cap, a machine with no network retries every forty-five seconds for
 * as long as the window is open — an app quietly hammering a CDN because nobody
 * bounded a loop. After these, it waits for the ordinary interval or for the
 * window to come back, both of which are cheap and both of which are enough.
 */
const RETRIES = 3;

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
  /** When the last attempt was made, so returning to the window can decide. */
  const lastTried = useRef(0);
  /** Consecutive failures, reset by anything that works. */
  const failures = useRef(0);
  const busyNow = useRef(busy);
  busyNow.current = busy;

  const run = useCallback(async (byHand = false) => {
    if (!isTauri()) return;
    lastTried.current = Date.now();
    setAsked(byHand);
    setProblem(null);
    setStage("checking");
    try {
      const update = await check();
      if (!update) {
        pending.current = null;
        failures.current = 0;
        setStage("idle");
        return;
      }
      pending.current = update;
      failures.current = 0;
      setVersion(update.version);
      setNotes(update.body ?? null);
      setStage("available");
    } catch (error) {
      // Said, not swallowed. An update that cannot be reached is ordinary — a
      // firewall, a plane, a CDN having a bad day — and it is only worth a
      // sentence where somebody went looking. It never reaches the workspace.
      pending.current = null;
      failures.current += 1;
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

  // A failed check is tried again soon rather than in six hours. Eight seconds
  // after launch is often before the network is up, and the window that misses
  // it is the whole morning.
  useEffect(() => {
    if (stage !== "failed" || failures.current >= RETRIES) return;
    const soon = setTimeout(() => void run(), RETRY);
    return () => clearTimeout(soon);
  }, [stage, run]);

  // And when the window comes back, which is the moment a laptop that was shut
  // has a network again. Only after a failure or a long silence — returning to
  // a window is not a request for news, and asking every time would make it
  // one.
  useEffect(() => {
    if (!isTauri()) return;
    function onFocus() {
      const quiet = Date.now() - lastTried.current;
      // A failure that has used up its retries is exactly the case a returning
      // window should answer: the reason it failed was usually that there was
      // no network, and there is one now.
      if (stage === "failed" || quiet > AGAIN) {
        failures.current = 0;
        void run();
      }
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [stage, run]);

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
