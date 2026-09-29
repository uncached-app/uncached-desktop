import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import i18n from "i18next";
import { describeError } from "../src/i18n/errors.ts";
import { CORE_ERROR_CODES } from "../src/utils/apiContract.ts";

const shell = (tag) =>
  JSON.parse(readFileSync(new URL(`../src/i18n/locales/${tag}/shell.json`, import.meta.url)));

await i18n.init({
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  resources: {
    en: { translation: { shell: shell("en") } },
    "pt-BR": { translation: { shell: shell("pt-BR") } },
  },
});

test("every code the backend can send has a sentence", () => {
  const messages = shell("en").errors;
  for (const code of CORE_ERROR_CODES) {
    assert.equal(typeof messages[code], "string", `no message for ${code}`);
  }
});

test("a refusal names the program that holds the target", () => {
  assert.equal(
    describeError({ code: "target_in_use", message: "target is in use", operation: "Xcode" }),
    "Xcode is running. Close it and scan again — removing this now would break it.",
  );
});

test("a code this build does not know falls back to the backend's text", () => {
  assert.equal(describeError({ code: "future_code", message: "raw text", operation: null }), "raw text");
});

test("the sentence follows the interface language", async () => {
  await i18n.changeLanguage("pt-BR");
  const translated = describeError({ code: "target_missing", message: "target does not exist" });
  await i18n.changeLanguage("en");
  assert.notEqual(translated, "The target no longer exists. Scan again.");
});

test("a licence refusal is translated by code and dated in the reader's calendar", async () => {
  const { describeCommandError } = await import("../src/i18n/errors.ts");
  const settings = JSON.parse(
    readFileSync(new URL("../src/i18n/locales/en/settings.json", import.meta.url)),
  );
  i18n.addResourceBundle("en", "translation", { settings }, true, true);

  assert.equal(
    describeCommandError(
      { code: "licence_expired", message: "This licence expired on 2026-09-01.", params: { date: "2026-09-01" } },
      "settings.license.errors",
      "failed",
    ),
    "This licence expired on September 1, 2026.",
  );
  assert.equal(describeCommandError("plain text", "settings.license.errors", "failed"), "plain text");
  assert.equal(describeCommandError(new Error("x"), "settings.license.errors", "failed"), "failed");
  assert.equal(
    describeCommandError({ code: "internal", message: "disk full" }, "settings.license.errors", "failed"),
    "disk full",
  );
});
