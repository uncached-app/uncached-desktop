/**
 * Every language the interface ships in, by BCP 47 tag.
 *
 * `name` is the language in itself, because a reader who cannot read the
 * current language has to recognise their own in the list.
 */
export const LOCALES = Object.freeze([
  { tag: "en", name: "English", dir: "ltr" },
  { tag: "pt-BR", name: "Português (Brasil)", dir: "ltr" },
  { tag: "es", name: "Español", dir: "ltr" },
  { tag: "de", name: "Deutsch", dir: "ltr" },
  { tag: "ja", name: "日本語", dir: "ltr" },
  { tag: "ar", name: "العربية", dir: "rtl" },
]);

export const FALLBACK_LOCALE = "en";

const TAGS = new Set(LOCALES.map((locale) => locale.tag));

/**
 * The supported tag a preference resolves to.
 *
 * `preference` is a supported tag or `"system"`. `systemLanguages` is
 * `navigator.languages`, most preferred first. Each system language is tried
 * exactly, then by its base language, so `pt-PT` reaches `pt-BR` and `es-MX`
 * reaches `es`. The first match wins; nothing matching falls back to English.
 */
export function resolveLocale(preference, systemLanguages) {
  if (preference && preference !== "system" && TAGS.has(preference)) return preference;

  for (const language of systemLanguages ?? []) {
    if (typeof language !== "string" || language.length === 0) continue;
    if (TAGS.has(language)) return language;
    const base = language.split("-")[0].toLowerCase();
    const byBase = LOCALES.find((locale) => locale.tag.split("-")[0].toLowerCase() === base);
    if (byBase) return byBase.tag;
  }
  return FALLBACK_LOCALE;
}

/** Writing direction for a supported tag. */
export function directionOf(tag) {
  return LOCALES.find((locale) => locale.tag === tag)?.dir ?? "ltr";
}
