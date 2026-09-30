import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { setFormatLocale } from "../utils/format.mjs";
import { bidiIsolateFormatter } from "./bidi.mjs";
import { directionOf, FALLBACK_LOCALE, resolveLocale } from "./locales.mjs";
import { pushNativeStrings } from "./native";
import type { LanguagePreference, LocaleTag } from "./locales.d.mts";
import dependencies from "./locales/en/dependencies.json";
import findings from "./locales/en/findings.json";
import insights from "./locales/en/insights.json";
import maintenance from "./locales/en/maintenance.json";
import modules from "./locales/en/modules.json";
import settings from "./locales/en/settings.json";
import shell from "./locales/en/shell.json";
import workspace from "./locales/en/workspace.json";

export const defaultNS = "translation";

/** English, imported by name so its shape types every key. */
const english = { dependencies, findings, insights, maintenance, modules, settings, shell, workspace };

/**
 * `./locales/<tag>/<area>.json`, one file per area so each can be edited on its
 * own. Every other language is assembled into the same shape as English; the
 * locale tests are what hold them to it.
 */
const fragments = import.meta.glob<Record<string, unknown>>("./locales/*/*.json", {
  eager: true,
  import: "default",
});

function assemble(tag: LocaleTag): Record<string, unknown> {
  const tree: Record<string, unknown> = {};
  for (const [path, content] of Object.entries(fragments)) {
    const match = path.match(/^\.\/locales\/([^/]+)\/([^/]+)\.json$/);
    if (match && match[1] === tag) tree[match[2]] = content;
  }
  return tree;
}

export const resources = {
  en: { translation: english },
  "pt-BR": { translation: assemble("pt-BR") },
  es: { translation: assemble("es") },
  de: { translation: assemble("de") },
  ja: { translation: assemble("ja") },
  ar: { translation: assemble("ar") },
};

/**
 * The tag the first paint uses, before settings arrive from the native side.
 *
 * Settings live in Rust and take a round trip to read, so a reader who chose a
 * language other than the system's would otherwise see the system's for a
 * frame. The last applied tag is kept here as a per-machine convenience; a
 * missing or unreadable value just means following the system.
 */
const LAST_LOCALE_KEY = "uncached.locale";

function rememberedLocale(): LocaleTag | null {
  try {
    const stored = window.localStorage.getItem(LAST_LOCALE_KEY);
    return stored ? resolveLocale(stored as LanguagePreference, []) : null;
  } catch {
    return null;
  }
}

function remember(tag: LocaleTag): void {
  try {
    window.localStorage.setItem(LAST_LOCALE_KEY, tag);
  } catch {
    // Storage is a convenience; a blocked write only costs one frame next launch.
  }
}

function paintDocument(tag: LocaleTag): void {
  document.documentElement.lang = tag;
  document.documentElement.dir = directionOf(tag);
  setFormatLocale(tag);
}

const initial = rememberedLocale() ?? resolveLocale("system", navigator.languages);

void i18n
  .use(bidiIsolateFormatter as never)
  .use(initReactI18next)
  .init({
  resources,
  lng: initial,
  fallbackLng: FALLBACK_LOCALE,
  defaultNS,
  // React escapes what it renders. `alwaysFormat` routes every value through
  // the bidi formatter, which only changes anything in a right-to-left language.
  interpolation: { escapeValue: false, alwaysFormat: true },
  returnNull: false,
});
paintDocument(initial);

/** Switches the whole interface, including `lang` and `dir` on the document. */
export function applyLanguage(preference: LanguagePreference): LocaleTag {
  const tag = resolveLocale(preference, navigator.languages);
  paintDocument(tag);
  remember(tag);
  if (i18n.language !== tag) void i18n.changeLanguage(tag);
  pushNativeStrings(tag);
  return tag;
}

export default i18n;
