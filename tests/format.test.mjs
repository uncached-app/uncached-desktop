import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes } from "../src/utils/format.mjs";

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/**
 * The table `format_size` in `src-tauri/src/models/target.rs` is checked
 * against, entry for entry. That file has a test of the same name; a row added
 * here has to be added there.
 */
const AGREED = [
  [0, "0 B"],
  [1, "1 B"],
  [1023, "1023 B"],
  [KB, "1.00 KB"],
  [MB - 1, "1024.00 KB"],
  [MB, "1.00 MB"],
  [GB, "1.00 GB"],
  [1536, "1.50 KB"],
  // The ties. Rust rounds a half to even and `toFixed` rounds it away from
  // zero, which is the whole reason this file exists.
  [GB + GB / 8, "1.12 GB"],
  [GB * 2 + GB * 3 / 8, "2.38 GB"],
  [MB * 2 + MB * 5 / 8, "2.62 MB"],
  [KB + KB * 7 / 8, "1.88 KB"],
];

test("formatBytes agrees with format_size in Rust, row for row", () => {
  for (const [bytes, expected] of AGREED) {
    assert.equal(formatBytes(bytes), expected, `${bytes} bytes`);
  }
});

test("a size on a tie rounds to the even digit, not away from zero", () => {
  // What `toFixed` would have said, kept as the thing being ruled out.
  assert.notEqual(formatBytes(1207959552), "1.13 GB");
  assert.equal(formatBytes(1207959552), "1.12 GB");
});

test("a byte count past the exact range of a double still counts", () => {
  // 100 TB. `bytes * 100` in doubles stops being exact around 90 TB.
  assert.equal(formatBytes(100 * 1024 * GB), "102400.00 GB");
});

test("nothing under a kilobyte grows a decimal point", () => {
  assert.equal(formatBytes(512), "512 B");
});
