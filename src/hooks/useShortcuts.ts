import { useEffect, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { DEFAULT_BINDINGS, type ActionId } from "../actions";
import { isTyping, matchesBinding, resolveBindings } from "../utils/keys.mjs";

/**
 * Binds the app's named actions to keys, and to the menu bar.
 *
 * One listener for all of them rather than one per feature. The old shape — a
 * `keydown` effect beside whatever it operated — is why there was a single
 * shortcut: adding a second meant knowing what the first had taken, and nothing
 * held that list.
 *
 * The menu is the same actions arriving by a different road. macOS sends a menu
 * item as an event rather than a keystroke, so the accelerator shown next to it
 * is handled by the system and never reaches the window at all; running both
 * through here is what keeps the two spellings of one verb doing one thing.
 */
export function useShortcuts(
  handlers: Partial<Record<ActionId, () => void>>,
  overrides: Record<string, string> | undefined,
) {
  const bindings = useMemo(() => resolveBindings(DEFAULT_BINDINGS, overrides), [overrides]);

  // Read through a ref so a handler that closes over changing state does not
  // re-attach the listener on every render that changes it.
  const current = useRef(handlers);
  current.current = handlers;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      for (const [action, binding] of Object.entries(bindings)) {
        if (!matchesBinding(event, binding)) continue;
        if (isTyping(event.target, binding)) return;
        const run = current.current[action as ActionId];
        if (!run) return;
        event.preventDefault();
        run();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bindings]);

  useEffect(() => {
    if (!isTauri()) return;
    let dispose: (() => void) | undefined;
    let disposed = false;

    void listen<string>("menu:action", ({ payload }) => {
      current.current[payload as ActionId]?.();
    }).then((stop) => {
      if (disposed) stop();
      else dispose = stop;
    });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, []);

  return bindings;
}
