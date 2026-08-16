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

const COMPLETE = {
  "aarch64-apple-darwin": { "Uncached.app.tar.gz": "sig-arm" },
  "x86_64-apple-darwin": { "Uncached.app.tar.gz": "sig-intel" },
  "x86_64-unknown-linux-gnu": { "Uncached.AppImage.tar.gz": "sig-linux" },
  "x86_64-pc-windows-msvc": { "Uncached_x64-setup.nsis.zip": "sig-windows" },
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
  const unsigned = { ...COMPLETE, "x86_64-unknown-linux-gnu": { "Uncached.AppImage.tar.gz": null } };
  const said = refuses(staged(unsigned));
  assert.match(said ?? "", /linux-x86_64/);
});

test("two signed bundles for one platform is a question the script may not answer", () => {
  const ambiguous = {
    ...COMPLETE,
    "x86_64-pc-windows-msvc": {
      "Uncached_x64-setup.nsis.zip": "a",
      "Uncached_x64_en-US.msi.zip": "b",
    },
  };
  const said = refuses(staged(ambiguous));
  assert.match(said ?? "", /windows-x86_64/);
});

test("an installer with no signature is ignored rather than mistaken for one", () => {
  // `.dmg` and `.deb` are what a first-time visitor downloads. They carry no
  // signature and the updater cannot apply them, so they belong in the release
  // and not in the manifest.
  const withInstallers = {
    ...COMPLETE,
    "aarch64-apple-darwin": { "Uncached.app.tar.gz": "sig-arm", "Uncached.dmg": null },
  };
  const manifest = build(staged(withInstallers));
  assert.match(manifest.platforms["darwin-aarch64"].url, /Uncached\.app\.tar\.gz$/);
});
