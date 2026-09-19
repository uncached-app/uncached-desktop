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
export function formatAge(seconds, now = Date.now()) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const days = Math.floor((now - seconds * 1000) / DAY_MS);
  if (days < 0) return "today";
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Whether a timestamp is at least `days` old. Unknown ages are never old. */
export function isOlderThan(seconds, days, now = Date.now()) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return false;
  return now - seconds * 1000 >= days * DAY_MS;
}

export function formatBytes(bytes) {
  const whole = Math.trunc(bytes);
  for (const { unit, suffix } of UNITS) {
    if (whole >= unit) return `${twoPlaces(whole, unit)} ${suffix}`;
  }
  return `${whole} B`;
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
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, "0")}`;
}
