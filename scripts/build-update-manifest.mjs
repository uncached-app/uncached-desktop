#!/usr/bin/env node
/**
 * Writes the `latest.json` every installed copy of Uncached reads.
 *
 * The whole file is derived from what the build actually produced. Nothing here
 * is written by hand and nothing is assumed present: a manifest naming a bundle
 * that was not uploaded is an update that fails after downloading, and a
 * manifest silently missing a platform is that platform never being updated
 * again — with no error anywhere, because a client that is not offered an
 * update is indistinguishable from one that is current.
 *
 * So a missing platform is a failed release, not a smaller manifest.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Rust target triples to the keys Tauri's updater looks itself up by, and what
 * each one updates *from*.
 *
 * Two macOS entries rather than a universal binary: the manifest keys on
 * architecture, and an Intel machine handed an Apple Silicon bundle fails in a
 * way whose message helps nobody.
 *
 * The pattern is per platform rather than one list of extensions, because
 * "carries a `.sig`" does not mean "is the thing that updates". A Linux build
 * signs its `.deb` and its `.rpm` too — both are installers a person downloads
 * once, and neither is something the updater can apply to a running copy. One
 * shared pattern made those three indistinguishable, and the release stopped on
 * an ambiguity that was not one.
 *
 * Linux is the `.AppImage` itself. Tauri 1 wrapped it in a `.tar.gz` and Tauri
 * 2 signs it directly; both spellings are accepted so that upgrading the
 * bundler does not quietly produce a manifest with no Linux entry.
 */
const PLATFORMS = {
  "aarch64-apple-darwin": { key: "darwin-aarch64", updates: /\.app\.tar\.gz$/ },
  "x86_64-apple-darwin": { key: "darwin-x86_64", updates: /\.app\.tar\.gz$/ },
  "x86_64-unknown-linux-gnu": {
    key: "linux-x86_64",
    updates: /\.AppImage(\.tar\.gz)?$/,
  },
  // Windows updates from the NSIS installer itself. Tauri 2 signs
  // `-setup.exe` and reports only that pair as artifacts; the `.nsis.zip`
  // beside it is Tauri 1's shape and is accepted so a bundler change fails
  // loudly rather than dropping Windows from the manifest.
  "x86_64-pc-windows-msvc": {
    key: "windows-x86_64",
    updates: /(-setup\.exe|\.(nsis|msi)\.zip)$/,
  },
};

function argument(name, fallback = null) {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1 || at === process.argv.length - 1) {
    if (fallback === null) {
      console.error(`Missing --${name}`);
      process.exit(1);
    }
    return fallback;
  }
  return process.argv[at + 1];
}

const version = argument("version");
// Read from a file rather than an argument: what a user reads about a release
// is prose, and prose on a command line is one unescaped quote away from being
// truncated in a way nobody notices until it is published.
const notesFile = argument("notes-file", "");
// The file opens with the version, which is what the release step checks the
// notes are not stale against. The reader does not need it — the app draws the
// version directly above these words — so the heading anchors the guard and is
// dropped from what ships.
const notes = notesFile
  ? readFileSync(notesFile, "utf8").replace(/^#.*\n+/, "").trim()
  : argument("notes", "");
const from = argument("from");
const base = argument("base").replace(/\/+$/, "");
const out = argument("out");

const platforms = {};
const missing = [];

for (const [triple, { key, updates }] of Object.entries(PLATFORMS)) {
  const directory = join(from, `release-${triple}`);
  let entries;
  try {
    entries = readdirSync(directory).filter((name) =>
      statSync(join(directory, name)).isFile(),
    );
  } catch {
    missing.push(`${key}: no artifacts were uploaded for ${triple}`);
    continue;
  }

  // The signature is the anchor, not the bundle: a bundle without one cannot be
  // applied by any client, so pairing from the `.sig` side means an unsigned
  // build is caught here rather than by every user at once.
  const signatures = entries.filter((name) => name.endsWith(".sig"));
  const paired = signatures
    .map((signature) => ({ signature, bundle: signature.slice(0, -".sig".length) }))
    .filter((pair) => updates.test(pair.bundle) && entries.includes(pair.bundle));

  if (paired.length === 0) {
    missing.push(`${key}: no signed updater bundle in ${directory}`);
    continue;
  }
  if (paired.length > 1) {
    missing.push(
      `${key}: ${paired.length} signed bundles (${paired.map((pair) => pair.bundle).join(", ")}) — which one updates is not something this script may guess`,
    );
    continue;
  }

  const [{ bundle, signature }] = paired;
  platforms[key] = {
    signature: readFileSync(join(directory, signature), "utf8").trim(),
    // Under the triple, not beside it. Both macOS builds emit a bundle with
    // the same filename, so a flat directory has them overwrite each other and
    // half of all Mac users are handed the wrong architecture — a failure that
    // reaches only the people it breaks, and only after they download.
    url: `${base}/${triple}/${encodeURIComponent(bundle)}`,
  };
}

// The invariant behind that, asserted rather than trusted: no two platforms may
// resolve to one file. If this ever fires, a naming assumption changed.
const urls = new Map();
for (const [key, entry] of Object.entries(platforms)) {
  const clash = urls.get(entry.url);
  if (clash) missing.push(`${key} and ${clash} would download the same file: ${entry.url}`);
  urls.set(entry.url, key);
}

if (missing.length > 0) {
  console.error("This release cannot be published:\n  " + missing.join("\n  "));
  process.exit(1);
}

writeFileSync(
  out,
  JSON.stringify(
    {
      version,
      notes,
      pub_date: new Date().toISOString(),
      platforms,
    },
    null,
    2,
  ) + "\n",
);

console.log(`Wrote ${out} for ${version} across ${Object.keys(platforms).length} platforms`);
