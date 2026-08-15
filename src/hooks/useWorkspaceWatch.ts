import { useEffect, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * Re-reads the workspace when the disk says it changed.
 *
 * The refusals are the feature. Reporting a change is the easy half; the work
 * is deciding when acting on one is worse than not.
 *
 * **Not during a scan or a cleanup.** Both are the app walking and writing the
 * same tree. Re-indexing under a scan races the thing the user is watching
 * finish, and a cleanup removing directories is a change on disk that would ask
 * for a re-read of what the cleanup is already re-reading — landing mid-removal.
 *
 * **Not while nobody is looking.** A hidden window has the focus path, which is
 * how it worked before this existed.
 *
 * **Not oftener than the reading costs.** `refreshIfStale` already holds the
 * rule that an index read moments ago is not read again, and that rule belongs
 * in one place whatever asks for it.
 */
export function useWorkspaceWatch({
  roots,
  busy,
  onChanged,
}: {
  roots: string[];
  /** A scan or a cleanup is running, so the disk is changing on purpose. */
  busy: boolean;
  onChanged: () => void;
}) {
  const busyNow = useLatest(busy);
  const changed = useLatest(onChanged);

  // The native side holds the watcher, because a watcher is a thread and a set
  // of kernel handles, and the window is the part of this that can go away.
  useEffect(() => {
    if (!isTauri()) return;
    void invoke("watch_workspace", { roots }).catch((error) => {
      // No watcher leaves the behaviour that existed before this: the window
      // reads again when it comes back. Survivable, so not an error on screen —
      // but said out loud, because a silently swallowed one is a feature that
      // looks implemented and is not.
      console.warn("uncached: not watching the workspace —", error);
    });
  }, [roots]);

  useEffect(() => {
    if (!isTauri()) return;
    let dispose: (() => void) | undefined;
    let disposed = false;

    void listen("workspace:changed", () => {
      if (busyNow.current) return;
      if (document.visibilityState === "hidden") return;
      changed.current();
    }).then((stop) => {
      if (disposed) stop();
      else dispose = stop;
    });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, [busyNow, changed]);
}

/** The current value of something, without it re-running an effect. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
