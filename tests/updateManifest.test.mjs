import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "build-update-manifest.mjs");

/** A directory shaped like what `download-artifact` leaves behind. */
function staged(bundles) {
  const root = mkdtempSync(join(tmpdir(), "uncached-manifest-"));
  for (const [triple, files] of Object.entries(bundles)) {
    const directory = join(root, `release-${triple}`);
    mkdirSync(directory, { recursive: true });
    for (const [name, signature] of Object.entries(files)) {
      writeFileSync(join(directory, name), "");
      if (signature !== null) writeFileSync(join(directory, `${name}.sig`), signature);
    }
  }
  return root;
}

/**
 * The filenames a real release actually produced, copied from a run rather than
 * imagined. The first version of this table was invented, and every name in it
 * that mattered was wrong: Linux signs three bundles, not one, and the one that
 * updates is a bare `.AppImage` — Tauri 1's `.AppImage.tar.gz` no longer
 * exists. A fixture that agrees with the code and not with the bundler tests
 * nothing.
 */
const COMPLETE = {
  "aarch64-apple-darwin": {
    "Uncached.app.tar.gz": "sig-arm",
    "Uncached_0.1.1-alpha.3_aarch64.dmg": null,
  },
  "x86_64-apple-darwin": {
    "Uncached.app.tar.gz": "sig-intel",
    "Uncached_0.1.1-alpha.3_x64.dmg": null,
  },
  "x86_64-unknown-linux-gnu": {
    "Uncached_0.1.1-alpha.3_amd64.AppImage": "sig-linux",
    "Uncached_0.1.1-alpha.3_amd64.deb": "sig-deb",
    "Uncached-0.1.1-alpha.3-1.x86_64.rpm": "sig-rpm",
  },
  "x86_64-pc-windows-msvc": {
    "Uncached_0.1.1-alpha.3_x64-setup.nsis.zip": "sig-windows",
    "Uncached_0.1.1-alpha.3_x64-setup.exe": null,
  },
};

function build(from, extra = []) {
  const out = join(from, "latest.json");
  execFileSync(
    process.execPath,
    [SCRIPT, "--version", "0.1.2", "--notes", "n", "--from", from, "--base", "https://cdn.uncached.app/releases/0.1.2", "--out", out, ...extra],
    { stdio: "pipe" },
  );
  return JSON.parse(readFileSync(out, "utf8"));
}

function refuses(from) {
  try {
    build(from);
  } catch (error) {
    return String(error.stderr ?? "");
  }
  return null;
}

test("every platform the app ships gets an entry", () => {
  const manifest = build(staged(COMPLETE));
  assert.deepEqual(Object.keys(manifest.platforms).sort(), [
    "darwin-aarch64",
    "darwin-x86_64",
    "linux-x86_64",
    "windows-x86_64",
  ]);
  assert.equal(manifest.version, "0.1.2");
});

test("the two macOS builds never resolve to one file", () => {
  // Both emit a bundle with the same name. Flattened into one directory, one
  // overwrites the other and half of all Mac users are handed the wrong
  // architecture — after downloading it, with no message that helps.
  const manifest = build(staged(COMPLETE));
  assert.notEqual(
    manifest.platforms["darwin-aarch64"].url,
    manifest.platforms["darwin-x86_64"].url,
  );
  const urls = Object.values(manifest.platforms).map((entry) => entry.url);
  assert.equal(new Set(urls).size, urls.length);
});

test("the signature is carried through, not invented", () => {
  const manifest = build(staged(COMPLETE));
  assert.equal(manifest.platforms["darwin-aarch64"].signature, "sig-arm");
  assert.equal(manifest.platforms["windows-x86_64"].signature, "sig-windows");
});

test("a missing platform fails the release rather than shrinking the manifest", () => {
  // The failure this guards is silent by nature: a client that is not offered
  // an update looks exactly like one that is current, so those users would
  // simply never update again and nothing anywhere would say so.
  const partial = { ...COMPLETE };
  delete partial["x86_64-pc-windows-msvc"];
  const said = refuses(staged(partial));
  assert.match(said ?? "", /windows-x86_64/);
});

test("an unsigned bundle is not published", () => {
  const unsigned = {
    ...COMPLETE,
    "x86_64-unknown-linux-gnu": { "Uncached_0.1.1-alpha.3_amd64.AppImage": null },
  };
  const said = refuses(staged(unsigned));
  assert.match(said ?? "", /linux-x86_64/);
});

test("two signed bundles for one platform is a question the script may not answer", () => {
  const ambiguous = {
    ...COMPLETE,
    "x86_64-pc-windows-msvc": {
      "Uncached_0.1.1-alpha.3_x64-setup.nsis.zip": "a",
      "Uncached_0.1.1-alpha.3_x64_en-US.msi.zip": "b",
    },
  };
  const said = refuses(staged(ambiguous));
  assert.match(said ?? "", /windows-x86_64/);
});

test("a signed installer is still not the thing that updates", () => {
  // The one that nearly shipped wrong. Linux signs its `.deb` and its `.rpm`
  // as well as its `.AppImage`, so "carries a signature" is not the same
  // question as "is what the updater applies" — and a rule that could not tell
  // them apart refused the release for an ambiguity that was not one.
  const manifest = build(staged(COMPLETE));
  assert.match(manifest.platforms["linux-x86_64"].url, /\.AppImage$/);
  assert.equal(manifest.platforms["linux-x86_64"].signature, "sig-linux");
});

test("the Tauri 1 spelling of the Linux bundle is still understood", () => {
  // So that changing bundler version fails loudly rather than producing a
  // manifest quietly missing Linux.
  const older = {
    ...COMPLETE,
    "x86_64-unknown-linux-gnu": { "Uncached.AppImage.tar.gz": "sig-linux-v1" },
  };
  const manifest = build(staged(older));
  assert.equal(manifest.platforms["linux-x86_64"].signature, "sig-linux-v1");
});

test("an installer with no signature is ignored rather than mistaken for one", () => {
  // `.dmg` and `.deb` are what a first-time visitor downloads. They carry no
  // signature and the updater cannot apply them, so they belong in the release
  // and not in the manifest.
  const manifest = build(staged(COMPLETE));
  assert.match(manifest.platforms["darwin-aarch64"].url, /Uncached\.app\.tar\.gz$/);
  assert.match(manifest.platforms["windows-x86_64"].url, /\.nsis\.zip$/);
});
