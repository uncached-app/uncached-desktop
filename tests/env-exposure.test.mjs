import test from "node:test";
import assert from "node:assert/strict";
import { envFixCommand, shellQuote } from "../src/utils/envExposure.mjs";

test("plain paths are left bare", () => {
  assert.equal(shellQuote("apps/web/.env.local"), "apps/web/.env.local");
});

test("paths with spaces or quotes are single-quoted", () => {
  assert.equal(shellQuote("my app/.env"), "'my app/.env'");
  assert.equal(shellQuote("it's/.env"), `'it'\\''s/.env'`);
  assert.equal(shellQuote("$(rm -rf ~)/.env"), "'$(rm -rf ~)/.env'");
});

test("an unignored env file only needs ignoring", () => {
  assert.equal(envFixCommand({ path: ".env.local", committed: false }), "echo .env.local >> .gitignore");
});

test("a committed env file also leaves the index", () => {
  assert.equal(
    envFixCommand({ path: "apps/web/.env", committed: true }),
    "git rm --cached -- apps/web/.env && echo apps/web/.env >> .gitignore",
  );
});
