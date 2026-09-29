/** Mirrors `locales.mjs` so the module can be consumed from TypeScript. */

export type LocaleTag = "en" | "pt-BR" | "es" | "de" | "ja" | "ar";
export type Direction = "ltr" | "rtl";
/** A supported tag, or follow the operating system. */
export type LanguagePreference = LocaleTag | "system";

export declare const LOCALES: ReadonlyArray<{ tag: LocaleTag; name: string; dir: Direction }>;
export declare const FALLBACK_LOCALE: LocaleTag;

export declare function resolveLocale(
  preference: LanguagePreference | null | undefined,
  systemLanguages: readonly string[] | null | undefined,
): LocaleTag;

export declare function directionOf(tag: LocaleTag): Direction;
