import test from "node:test";
import assert from "node:assert/strict";
import i18n from "i18next";
import { bidiIsolateFormatter } from "../src/i18n/bidi.mjs";

const instance = i18n.createInstance();
await instance.use(bidiIsolateFormatter).init({
  lng: "ar",
  interpolation: { escapeValue: false, alwaysFormat: true },
  resources: {
    ar: { translation: { freed: "تم تحرير {{size}} من {{path}}" } },
    en: { translation: { freed: "Freed {{size}} from {{path}}" } },
  },
});

test("a value inside Arabic text keeps its own direction", () => {
  assert.equal(
    instance.t("freed", { size: "2.10 GB", path: "~/Library/Caches" }),
    "تم تحرير ⁨2.10 GB⁩ من ⁨~/Library/Caches⁩",
  );
});

test("left-to-right languages are left exactly as written", async () => {
  await instance.changeLanguage("en");
  assert.equal(
    instance.t("freed", { size: "2.10 GB", path: "~/Library/Caches" }),
    "Freed 2.10 GB from ~/Library/Caches",
  );
});

test("plural selection still reads the raw count", async () => {
  const counting = i18n.createInstance();
  await counting.use(bidiIsolateFormatter).init({
    lng: "ar",
    interpolation: { escapeValue: false, alwaysFormat: true },
    resources: { ar: { translation: { n_one: "واحد", n_two: "اثنان", n_other: "{{count}}" } } },
  });
  assert.equal(counting.t("n", { count: 2 }), "اثنان");
  assert.equal(counting.t("n", { count: 100 }), "⁨100⁩");
});
