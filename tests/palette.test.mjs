import assert from "node:assert/strict";
import test from "node:test";
import { groupCommands, rankCommands, scoreCommand } from "../src/utils/palette.mjs";
import { remoteLabel, remoteToUrl } from "../src/utils/remoteUrl.mjs";

function item(title, extra = {}) {
  return { id: title, group: "commands", title, ...extra };
}

test("an empty query changes nothing", () => {
  const items = [item("Zeta"), item("Alpha")];
  assert.deepEqual(rankCommands(items, ""), items);
  assert.deepEqual(rankCommands(items, "   "), items);
});

test("a prefix of the title beats a word inside it, which beats a substring", () => {
  const ranked = rankCommands(
    [item("Open in Finder"), item("Reveal folder"), item("Unfolder"), item("Folder map")],
    "folder",
  );

  assert.deepEqual(
    ranked.map((entry) => entry.title),
    ["Folder map", "Reveal folder", "Unfolder"],
    "and 'Open in Finder' does not hold those letters in order at all",
  );
});

test("a path or a branch finds a project the name would not", () => {
  const projects = [
    item("api", { subtitle: "/work/backend/api", keywords: ["main"] }),
    item("web", { subtitle: "/work/frontend/web", keywords: ["release/2.0"] }),
  ];

  assert.deepEqual(rankCommands(projects, "backend").map((entry) => entry.title), ["api"]);
  assert.deepEqual(rankCommands(projects, "release").map((entry) => entry.title), ["web"]);
});

/** The loosest claim of relevance there is, so it never outranks a real one. */
test("letters in order match, and always rank below anything that contains the query", () => {
  assert.ok(scoreCommand(item("Workspace map"), "wsmp") > 0, "wsmp finds Workspace map");

  const ranked = rankCommands([item("My archived pages"), item("Sitemap")], "map");
  assert.deepEqual(
    ranked.map((entry) => entry.title),
    ["Sitemap", "My archived pages"],
    "containing the query beats holding its letters in order",
  );
});

test("a tighter subsequence outranks a scattered one", () => {
  const tight = scoreCommand(item("Acme"), "ace");
  const scattered = scoreCommand(item("A cold engine"), "ace");
  assert.ok(tight !== null && scattered !== null, "both hold the letters in order");
  assert.ok(tight > scattered, "adjacent letters mean more than letters strewn about");
});

test("no match is null, not zero", () => {
  assert.equal(scoreCommand(item("Open settings"), "zzz"), null);
  assert.deepEqual(rankCommands([item("Open settings")], "zzz"), []);
});

test("ties keep the order they were given, so groups stay meaningful", () => {
  const ranked = rankCommands([item("Open api"), item("Open web"), item("Open zeta")], "open");
  assert.deepEqual(
    ranked.map((entry) => entry.title),
    ["Open api", "Open web", "Open zeta"],
  );
});

test("groups follow the ranking rather than a fixed order", () => {
  const ranked = rankCommands(
    [
      { id: "a", group: "commands", title: "Add folder" },
      { id: "p", group: "projects", title: "api" },
    ],
    "api",
  );
  assert.deepEqual(
    groupCommands(ranked).map((group) => group.id),
    ["projects"],
    "a group with no match does not appear at all",
  );
});

// --- remotes ---

test("the three spellings of a remote all resolve to the same page", () => {
  for (const remote of [
    "git@github.com:uncached-app/uncached-core.git",
    "ssh://git@github.com/uncached-app/uncached-core.git",
    "https://github.com/uncached-app/uncached-core.git",
    "https://github.com/uncached-app/uncached-core",
  ]) {
    assert.equal(remoteToUrl(remote), "https://github.com/uncached-app/uncached-core", remote);
  }
  assert.equal(remoteLabel("git@github.com:uncached-app/uncached-core.git"), "uncached-app/uncached-core");
});

test("a self-hosted remote keeps its host", () => {
  assert.equal(remoteToUrl("git@git.company.dev:team/app.git"), "https://git.company.dev/team/app");
});

/**
 * A remote is untrusted text from a file inside a folder we were pointed at,
 * and the result is handed to the system browser.
 */
test("anything that is not a remote server is refused", () => {
  for (const remote of [
    "",
    "   ",
    "/Users/me/mirror.git",
    "../sibling",
    "file:///Users/me/mirror.git",
    "javascript:alert(1)",
    "git@:no-host.git",
    "https://github.com/",
    null,
    undefined,
    42,
  ]) {
    assert.equal(remoteToUrl(remote), null, String(remote));
  }
});

/** Whatever it was fetched with, what gets opened is a web page, over TLS. */
test("an insecure remote is opened over https", () => {
  assert.equal(remoteToUrl("http://github.com/owner/repo.git"), "https://github.com/owner/repo");
  assert.equal(remoteToUrl("git://github.com/owner/repo.git"), "https://github.com/owner/repo");
});
