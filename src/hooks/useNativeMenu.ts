import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ACTIONS } from "../actions";
import { toAccelerator } from "../utils/keys.mjs";

/**
 * Hands the menu bar to the native side, and again whenever a key changes.
 *
 * Built from the same list the keyboard reads, so the accelerator printed
 * beside an item is the one the app honours. Two lists would agree until the
 * day one of them was edited, and the one that disagrees is the one on screen.
 *
 * Only the items that asked for a menu. Settings is bound and not listed:
 * macOS keeps that under the application menu, and a second copy under `File`
 * is the app disagreeing with the platform about where a thing lives.
 *
 * Sent on every platform and hung on the window by none but macOS, which is
 * where the decision belongs — the native side is the only one that knows this
 * window has no frame for a menu bar to live in. Every key still works
 * everywhere, and the palette reaches all of it by name.
 */
export function useNativeMenu(bindings: Record<string, string>) {
  useEffect(() => {
    if (!isTauri()) return;
    const actions = ACTIONS.filter((action) => action.menu !== null).map((action) => ({
      id: action.id,
      label: action.label,
      menu: action.menu,
      accelerator: toAccelerator(bindings[action.id] ?? action.binding),
    }));

    void invoke("install_menu", { actions }).catch(() => {
      // A menu that could not be built is a menu bar without the app's own
      // items. Everything it offers is reachable by key and by the palette, so
      // this is worth surviving rather than reporting.
    });
  }, [bindings]);
}
