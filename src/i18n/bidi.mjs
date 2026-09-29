import { directionOf } from "./locales.mjs";

/** U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE. */
const OPEN = "⁨";
const CLOSE = "⁩";

/**
 * i18next formatter that isolates every interpolated value in a right-to-left
 * language.
 *
 * A path, a size or a program name dropped into Arabic text takes its
 * direction from the surrounding sentence, so `~/Library/Caches` and `2.10 GB`
 * can render with their punctuation moved to the wrong end. An isolate lets the
 * value keep its own direction without affecting the words around it.
 *
 * Replaces the built-in formatter: the catalogue uses no named formats
 * (`{{value, format}}`), which `tests/i18n.test.mjs` enforces.
 */
export const bidiIsolateFormatter = {
  type: "formatter",
  init() {},
  add() {},
  addCached() {},
  format(value, _format, lng) {
    const text = value === null || value === undefined ? "" : String(value);
    return directionOf(lng) === "rtl" ? `${OPEN}${text}${CLOSE}` : text;
  },
};
