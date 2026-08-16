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
 * Rust target triples to the keys Tauri's updater looks itself up by.
 *
 * Two macOS entries rather than a universal binary: the manifest keys on
 * architecture, and an Intel machine handed an Apple Silicon bundle fails in a
 * way whose message helps nobody.
 */
const PLATFORMS = {
  "aarch64-apple-darwin": "darwin-aarch64",
  "x86_64-apple-darwin": "darwin-x86_64",
  "x86_64-unknown-linux-gnu": "linux-x86_64",
  "x86_64-pc-windows-msvc": "windows-x86_64",
};

/**
 * What each platform updates *from*. Only these carry a `.sig`, and only these
 * belong in the manifest — a `.dmg` is what a first-time visitor downloads and
 * is not something the updater can apply.
 */
const UPDATER_ARTIFACT = /\.(app\.tar\.gz|AppImage\.tar\.gz|tar\.gz|nsis\.zip|msi\.zip)$/;

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
const notes = argument("notes", "");
const from = argument("from");
const base = argument("base").replace(/\/+$/, "");
const out = argument("out");

const platforms = {};
const missing = [];

for (const [triple, key] of Object.entries(PLATFORMS)) {
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
    .filter(
      (pair) => UPDATER_ARTIFACT.test(pair.bundle) && entries.includes(pair.bundle),
    );

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
