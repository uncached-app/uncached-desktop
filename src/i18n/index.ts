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
 *
 * Loaded on demand, one chunk per file, rather than bundled: a reader uses one
 * language, and the other five used to ship in the first load of the app
 * anyway. English stays imported by name above, since it types every key and is
 * the fallback for anything a language lacks.
 */
const fragments = import.meta.glob<Record<string, unknown>>("./locales/*/*.json", {
  import: "default",
});

const loaded = new Set<LocaleTag>([FALLBACK_LOCALE]);
const loading = new Map<LocaleTag, Promise<void>>();

/** Makes a language's catalogue available to i18next. Resolves once it is. */
function loadLocale(tag: LocaleTag): Promise<void> {
  if (loaded.has(tag)) return Promise.resolve();
  let pending = loading.get(tag);
  if (!pending) {
    pending = (async () => {
      const tree: Record<string, unknown> = {};
      await Promise.all(
        Object.entries(fragments).map(async ([path, load]) => {
          const match = path.match(/^\.\/locales\/([^/]+)\/([^/]+)\.json$/);
          if (match && match[1] === tag) tree[match[2]] = await load();
        }),
      );
      i18n.addResourceBundle(tag, defaultNS, tree, true, true);
      loaded.add(tag);
    })().finally(() => loading.delete(tag));
    loading.set(tag, pending);
  }
  return pending;
}

/** English only; the type that keys are checked against. */
export const resources = {
  en: { translation: english },
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

/**
 * Settles once the first paint's language is ready, and never rejects.
 *
 * The app renders after this, so a reader whose language is not English never
 * sees English for a frame. If the catalogue cannot be loaded the interface
 * stays in English, which is what every missing string falls back to anyway.
 */
export const ready: Promise<void> = loadLocale(initial)
  .then(() => paintDocument(initial))
  .catch(() => {
    paintDocument(FALLBACK_LOCALE);
    void i18n.changeLanguage(FALLBACK_LOCALE);
  });

let requested: LocaleTag = initial;

/**
 * Switches the whole interface, including `lang` and `dir` on the document.
 *
 * Returns the tag the preference resolves to straight away, but the change is
 * applied once that language's catalogue has loaded, so the screen goes from
 * one complete language to another instead of through a half-translated one.
 */
export function applyLanguage(preference: LanguagePreference): LocaleTag {
  const tag = resolveLocale(preference, navigator.languages);
  requested = tag;
  void loadLocale(tag).then(
    () => {
      // Another choice may have been made while this one loaded.
      if (requested !== tag) return;
      paintDocument(tag);
      remember(tag);
      if (i18n.language !== tag) void i18n.changeLanguage(tag);
      pushNativeStrings(tag);
    },
    (error) => {
      // Nothing was loaded, so nothing is applied: the current language stays.
      // Said once, because otherwise a choice that does nothing leaves no trace.
      console.warn(`Could not load the "${tag}" translations; keeping the current language.`, error);
    },
  );
  return tag;
}

export default i18n;
