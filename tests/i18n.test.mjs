import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { LOCALES, directionOf, resolveLocale } from "../src/i18n/locales.mjs";

const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"];

/** One tree per language, one branch per `<area>.json`, as the app assembles it. */
function load(tag) {
  const directory = new URL(`../src/i18n/locales/${tag}/`, import.meta.url);
  const tree = {};
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
    tree[file.slice(0, -".json".length)] = JSON.parse(readFileSync(new URL(file, directory)));
  }
  return tree;
}

test("every language ships the same set of area files", () => {
  const areas = (tag) =>
    readdirSync(new URL(`../src/i18n/locales/${tag}/`, import.meta.url)).sort().join(",");
  for (const { tag } of LOCALES) assert.equal(areas(tag), areas("en"), tag);
});

/** Every leaf as `a.b.c` → string. */
function flatten(tree, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") flatten(value, path, out);
    else out.set(path, value);
  }
  return out;
}

function pluralBase(path) {
  const match = path.match(new RegExp(`^(.*)_(${PLURAL_SUFFIXES.join("|")})$`));
  return match ? match[1] : null;
}

/** The categories `Intl.PluralRules` actually returns for whole counts. */
function reachableCategories(tag) {
  const rules = new Intl.PluralRules(tag);
  const seen = new Set();
  for (let count = 0; count <= 1000; count += 1) seen.add(rules.select(count));
  return seen;
}

function placeholders(text) {
  return new Set([...String(text).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]));
}

const english = flatten(load("en"));
const englishPlurals = new Set([...english.keys()].map(pluralBase).filter(Boolean));

for (const { tag } of LOCALES.filter((locale) => locale.tag !== "en")) {
  const messages = flatten(load(tag));

  test(`${tag} carries every message English has`, () => {
    for (const [path, text] of english) {
      if (pluralBase(path)) continue;
      assert.ok(messages.has(path), `${tag} is missing ${path}`);
      assert.equal(typeof messages.get(path), "string", `${tag}.${path} is not text`);
      assert.notEqual(messages.get(path).trim(), "", `${tag}.${path} is empty`);
      assert.deepEqual(
        placeholders(messages.get(path)),
        placeholders(text),
        `${tag}.${path} drops or invents a placeholder`,
      );
    }
  });

  test(`${tag} has every plural form its grammar can reach`, () => {
    const needed = reachableCategories(tag);
    for (const base of englishPlurals) {
      for (const category of needed) {
        const path = `${base}_${category}`;
        assert.ok(messages.has(path), `${tag} is missing ${path}`);
        // A form may leave the count unsaid ("Ein Ziel", "هدف واحد"): the
        // category already fixes the number. Every other placeholder stays.
        const expected = new Set(placeholders(english.get(`${base}_other`)));
        const actual = new Set(placeholders(messages.get(path)));
        expected.delete("count");
        actual.delete("count");
        assert.deepEqual(actual, expected, `${tag}.${path} drops or invents a placeholder`);
      }
    }
  });

  test(`${tag} holds nothing English does not`, () => {
    for (const path of messages.keys()) {
      const base = pluralBase(path);
      const known = base ? englishPlurals.has(base) : english.has(path);
      assert.ok(known, `${tag}.${path} has no English source and would never be shown`);
    }
  });
}

test("a system language resolves to the closest supported one", () => {
  assert.equal(resolveLocale("system", ["pt-BR"]), "pt-BR");
  assert.equal(resolveLocale("system", ["pt-PT", "en"]), "pt-BR");
  assert.equal(resolveLocale("system", ["es-MX"]), "es");
  assert.equal(resolveLocale("system", ["fr-FR", "de-AT"]), "de");
  assert.equal(resolveLocale("system", ["fr-FR"]), "en", "nothing supported falls back to English");
  assert.equal(resolveLocale("system", []), "en");
});

test("a chosen language wins over the system", () => {
  assert.equal(resolveLocale("ja", ["pt-BR"]), "ja");
  assert.equal(resolveLocale("fr", ["de"]), "de", "an unknown choice is ignored, not trusted");
});

test("only Arabic is written right to left", () => {
  for (const { tag } of LOCALES) {
    assert.equal(directionOf(tag), tag === "ar" ? "rtl" : "ltr", tag);
  }
});

test("no message uses a named format, because the bidi formatter replaces them", () => {
  for (const { tag } of LOCALES) {
    for (const [path, text] of flatten(load(tag))) {
      assert.doesNotMatch(String(text), /\{\{\s*\w+\s*,/, `${tag}.${path}`);
    }
  }
});
