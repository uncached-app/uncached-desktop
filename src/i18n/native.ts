import { invoke, isTauri } from "@tauri-apps/api/core";
import i18n from "i18next";
import { FALLBACK_LOCALE } from "./locales.mjs";
import type { LocaleTag } from "./locales.d.mts";

const NAMESPACE = "translation";

function resource(tag: string, key: string): string | undefined {
  const value = i18n.getResource(tag, NAMESPACE, key);
  return typeof value === "string" ? value : undefined;
}

/**
 * Every plural form the language uses, with placeholders left in for the
 * native side to fill. A form the catalogue lacks falls back to the same
 * language's `_other` before English, so a gap never mixes two languages in
 * one sentence.
 */
function forms(tag: LocaleTag, base: string): Record<string, string> {
  const other =
    resource(tag, `${base}_other`) ?? resource(FALLBACK_LOCALE, `${base}_other`) ?? "";
  const categories = new Intl.PluralRules(tag).resolvedOptions().pluralCategories;
  return Object.fromEntries(
    categories.map((category) => [category, resource(tag, `${base}_${category}`) ?? other]),
  );
}

/** A template with its placeholders left in, for the native side to fill. */
function template(tag: LocaleTag, key: string): string {
  return resource(tag, key) ?? resource(FALLBACK_LOCALE, key) ?? "";
}

function decimalSeparator(tag: LocaleTag): string {
  return new Intl.NumberFormat(tag).formatToParts(1.5).find((part) => part.type === "decimal")?.value ?? ".";
}

/** Hands the tray and notification sentences to the native side. */
export function pushNativeStrings(tag: LocaleTag): void {
  if (!isTauri()) return;
  const t = i18n.getFixedT(tag);
  const strings = {
    locale: tag,
    decimalSeparator: decimalSeparator(tag),
    trayOpen: t("shell.native.trayOpen"),
    trayScan: t("shell.native.trayScan"),
    trayQuit: t("shell.native.trayQuit"),
    trayFree: template(tag, "shell.native.trayFree"),
    trayReclaimable: template(tag, "shell.native.trayReclaimable"),
    trayRunMaintenance: t("shell.native.trayRunMaintenance"),
    scanFinished: forms(tag, "shell.native.scanFinished"),
    maintenanceTitle: t("shell.native.maintenanceTitle"),
    maintenanceBody: forms(tag, "shell.native.maintenanceBody"),
  };
  void invoke("set_native_strings", { strings }).catch(() => {
    // The tray and notifications keep their previous language; nothing on
    // screen depends on this call.
  });
}
