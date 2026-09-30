import test from "node:test";
import assert from "node:assert/strict";
import { secretFixCommand, shellQuote } from "../src/utils/secrets.mjs";

test("plain paths are left bare", () => {
  assert.equal(shellQuote("apps/web/.env.local"), "apps/web/.env.local");
});

test("paths with spaces or quotes are single-quoted", () => {
  assert.equal(shellQuote("my app/.env"), "'my app/.env'");
  assert.equal(shellQuote("it's/.env"), `'it'\\''s/.env'`);
  assert.equal(shellQuote("$(rm -rf ~)/.env"), "'$(rm -rf ~)/.env'");
});

test("an unignored secret only needs ignoring", () => {
  assert.equal(secretFixCommand({ path: ".env.local", committed: false }), "echo .env.local >> .gitignore");
});

test("a committed secret also leaves the index", () => {
  assert.equal(
    secretFixCommand({ path: "apps/web/.env", committed: true }),
    "git rm --cached -- apps/web/.env && echo apps/web/.env >> .gitignore",
  );
});
