import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppLanguage } from "./languages.ts";
import {
  englishName,
  nameText,
  shownName,
  spokenName,
  type DishNames,
} from "./item-names.ts";

const mysorePak = { name: "ಮೈಸೂರು ಪಾಕ್", name_latin: "Mysore pak" };
const kajuKatli = { name: "Kaju katli", name_latin: "Kaju katli" };

const transliterations: Record<Exclude<AppLanguage, "en">, string> = {
  hi: "मैसूर पाक",
  mr: "म्हैसूर पाक",
  kn: "ಮೈಸೂರು ಪಾಕ್",
  ta: "மைசூர் பாக்",
  te: "మైసూర్ పాక్",
};

test("an English page shows the English name alone", () => {
  assert.deepEqual(shownName(mysorePak, "en"), {
    primary: "Mysore pak",
    lang: "en",
    secondary: null,
  });
  assert.deepEqual(
    shownName({ ...mysorePak, name_script: "Mysore pak" }, "en"),
    { primary: "Mysore pak", lang: "en", secondary: null },
  );
  assert.equal(shownName(kajuKatli, "en").secondary, null);
});

test("a page in another language shows the name in its script first, then the English name", () => {
  for (const [language, script] of Object.entries(transliterations)) {
    assert.deepEqual(
      shownName(
        { name: "Mysore pak", name_latin: "Mysore pak", name_script: script },
        language as AppLanguage,
      ),
      { primary: script, lang: language, secondary: "Mysore pak" },
      language,
    );
  }
});

test("the seller's own name comes first when it is in the script of the page", () => {
  assert.deepEqual(shownName(mysorePak, "kn"), {
    primary: "ಮೈಸೂರು ಪಾಕ್",
    lang: "kn",
    secondary: "Mysore pak",
  });
  assert.deepEqual(
    shownName({ ...mysorePak, name_script: "ಮೈಸೂರ್ ಪಾಕ್" }, "kn").primary,
    "ಮೈಸೂರು ಪಾಕ್",
  );
  const vadaPav = { name: "वडा पाव", name_latin: "Vada pav" };
  assert.deepEqual(shownName(vadaPav, "mr"), {
    primary: "वडा पाव",
    lang: "mr",
    secondary: "Vada pav",
  });
  assert.equal(shownName(vadaPav, "hi").lang, "hi");
});

test("with no name in the script of the page, the English name shows alone", () => {
  for (const language of ["hi", "mr", "ta", "te"] as const) {
    assert.deepEqual(
      shownName(mysorePak, language),
      { primary: "Mysore pak", lang: "en", secondary: null },
      language,
    );
  }
  assert.equal(
    shownName({ ...mysorePak, name_script: null }, "hi").primary,
    "Mysore pak",
  );
  assert.equal(
    shownName({ ...mysorePak, name_script: " " }, "ta").primary,
    "Mysore pak",
  );
  assert.equal(shownName(kajuKatli, "kn").secondary, null);
});

test("a transliteration in another script, or in Latin letters, does not show", () => {
  assert.deepEqual(
    shownName({ ...mysorePak, name_script: "Mysore pak" }, "hi"),
    { primary: "Mysore pak", lang: "en", secondary: null },
  );
  assert.equal(
    shownName({ ...mysorePak, name_script: "ಮೈಸೂರು ಪಾಕ್" }, "hi").primary,
    "Mysore pak",
  );
});

test("a dish with no Latin form shows the name as she wrote it", () => {
  const chakkuli: DishNames = { name: "ಚಕ್ಕುಲಿ", name_latin: null };
  assert.deepEqual(shownName(chakkuli, "en"), {
    primary: "ಚಕ್ಕುಲಿ",
    lang: "kn",
    secondary: null,
  });
  assert.deepEqual(shownName(chakkuli, "kn"), {
    primary: "ಚಕ್ಕುಲಿ",
    lang: "kn",
    secondary: null,
  });
  assert.equal(englishName({ name: " Gujiya ", name_latin: " " }), "Gujiya");
});

test("one line joins the two parts with a dot, and a screen reader hears a pause", () => {
  const shown = shownName({ ...mysorePak, name_script: "मैसूर पाक" }, "hi");
  assert.equal(nameText(shown), "मैसूर पाक · Mysore pak");
  assert.equal(spokenName(shown), "मैसूर पाक, Mysore pak");
  assert.equal(nameText(shownName(mysorePak, "en")), "Mysore pak");
  assert.equal(spokenName(shownName(mysorePak, "en")), "Mysore pak");
});
