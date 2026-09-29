/**
 * The locale sizes and ages are written in when a caller does not name one.
 *
 * Set by the i18n layer whenever the interface language changes. Kept here so
 * this module stays free of any framework and testable under plain Node.
 */
let activeLocale = "en";

export function setFormatLocale(tag) {
  activeLocale = tag;
}

const UNITS = [
  { unit: 1024 ** 3, suffix: "GB" },
  { unit: 1024 ** 2, suffix: "MB" },
  { unit: 1024, suffix: "KB" },
];

/**
 * A byte count as the app writes it, everywhere.
 *
 * Mirrors `format_size` in `src-tauri/src/models/target.rs`, which formats the
 * sizes the backend sends already-rendered. Both are on screen at once — a
 * target row carries the backend's string and the project page formats the
 * same number here — so the two agreeing is not tidiness, it is the same
 * directory not reporting two different sizes.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long ago something was written, in the app's shorthand.
 *
 * `seconds` is a Unix timestamp, the unit every backend here reports times in.
 * Nothing measured yet reads as null rather than as "today": a cache whose age
 * is unknown is not a cache anybody should decide about.
 */
export function formatAge(seconds, now = Date.now(), locale = activeLocale) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  // `long` rather than `short`: CLDR's short Arabic form for a past month reads
  // as a future one ("within 3 months").
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "long" });
  const days = Math.floor((now - seconds * 1000) / DAY_MS);
  if (days < 1) return relative.format(0, "day");
  if (days < 30) return relative.format(-days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return relative.format(-months, "month");
  return relative.format(-Math.floor(months / 12), "year");
}

/** Whether a timestamp is at least `days` old. Unknown ages are never old. */
export function isOlderThan(seconds, days, now = Date.now()) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return false;
  return now - seconds * 1000 >= days * DAY_MS;
}

/**
 * Only the number is localised. The unit symbols are the ones every platform's
 * tooling prints, and CLDR's own short forms differ from them in ways that
 * would change the English output (`kB`, `byte`).
 *
 * Grouping is off so English stays identical to Rust's `format_size`, which
 * the parity table in the tests checks row for row.
 */
export function formatBytes(bytes, locale = activeLocale) {
  const whole = Math.trunc(bytes);
  for (const { unit, suffix } of UNITS) {
    if (whole >= unit) {
      const hundredths = twoPlaces(whole, unit);
      return `${decimals(locale).format(Number(hundredths) / 100)} ${suffix}`;
    }
  }
  return `${integers(locale).format(whole)} B`;
}

function decimals(locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

function integers(locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: false });
}

/**
 * `bytes / unit` to two places, rounding a tie to the even digit.
 *
 * Rust's `{:.2}` rounds a half to even and JavaScript's `toFixed` rounds it
 * away from zero, so 1207959552 bytes was "1.12 GB" from the backend and
 * "1.13 GB" from here. Ties are not exotic: a byte count over a power of two
 * lands on one whenever it is a multiple of the unit over eight.
 *
 * Integer arithmetic throughout, so nothing rounds twice. `BigInt` because
 * `bytes * 100` leaves the exact range of a double at about 90 TB, and a disk
 * cleaner is the one program that should not assume nobody has that much.
 */
function twoPlaces(bytes, unit) {
  const scaled = BigInt(bytes) * 100n;
  const divisor = BigInt(unit);
  let hundredths = scaled / divisor;
  const twiceRemainder = (scaled % divisor) * 2n;
  if (twiceRemainder > divisor || (twiceRemainder === divisor && hundredths % 2n === 1n)) {
    hundredths += 1n;
  }
  return hundredths;
}
