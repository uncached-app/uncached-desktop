import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (!isTauri()) return;
    const actions = ACTIONS.filter((action) => action.menu !== null).map((action) => ({
      id: action.id,
      label: t(`settings.shortcuts.actions.${action.id}.label`, { defaultValue: action.label }),
      menu: action.menu,
      accelerator: toAccelerator(bindings[action.id] ?? action.binding),
    }));
    const labels = {
      file: t("shell.menu.file"),
      edit: t("shell.menu.edit"),
      view: t("shell.menu.view"),
      workspace: t("shell.menu.workspace"),
      window: t("shell.menu.window"),
      about: t("shell.menu.about"),
      services: t("shell.menu.services"),
      hide: t("shell.menu.hide"),
      hideOthers: t("shell.menu.hideOthers"),
      showAll: t("shell.menu.showAll"),
      quit: t("shell.menu.quit"),
      undo: t("shell.menu.undo"),
      redo: t("shell.menu.redo"),
      cut: t("shell.menu.cut"),
      copy: t("shell.menu.copy"),
      paste: t("shell.menu.paste"),
      selectAll: t("shell.menu.selectAll"),
      minimize: t("shell.menu.minimize"),
      zoom: t("shell.menu.zoom"),
      closeWindow: t("shell.menu.closeWindow"),
    };

    // Rebuilt on a language change as well as on a binding change: the bar is
    // native objects holding their titles, not text that re-renders.
    void invoke("install_menu", { actions, labels }).catch(() => {
      // A menu that could not be built is a menu bar without the app's own
      // items. Everything it offers is reachable by key and by the palette, so
      // this is worth surviving rather than reporting.
    });
  }, [bindings, t, i18n.language]);
}
