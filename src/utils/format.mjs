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
