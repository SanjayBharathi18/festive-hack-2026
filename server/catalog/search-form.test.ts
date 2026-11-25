import assert from "node:assert/strict";
import { test } from "node:test";
import { searchForm, searchWords, sourceLanguage } from "./search-form.ts";

test("the search form is lower case, with no spaces and no marks", () => {
  assert.equal(searchForm("Kaju Katli"), "kajukatli");
  assert.equal(searchForm("  kaju   katli "), "kajukatli");
  assert.equal(searchForm("Shobha's Kitchen"), "shobhaskitchen");
  assert.equal(
    searchForm("Kobbari mithai (coconut burfi)"),
    "kobbarimithaicoconutburfi",
  );
  assert.equal(searchForm("kāju kaṭli"), "kajukatli");
});

test("a doubled vowel becomes one vowel, so common spellings meet", () => {
  for (const spelling of [
    "kaju katli",
    "kaaju katli",
    "Kaajoo Katlee",
    "kaju katlii",
    "KAJU-KATLI",
  ]) {
    assert.equal(searchForm(spelling), "kajukatli", spelling);
  }
  assert.equal(searchForm("Besan laddoo"), searchForm("besan laddu"));
  assert.equal(searchForm("kheer"), "khir");
});

test("Indian scripts keep their letters and vowel signs", () => {
  assert.equal(searchForm("ಕಾಜು ಕಟ್ಲಿ"), "ಕಾಜುಕಟ್ಲಿ");
  assert.equal(searchForm("काजू कतली"), "काजूकतली");
});

test("the words of a name keep their order, each in its search form", () => {
  assert.equal(searchWords("Besan Laddoo"), "besan laddu");
  assert.equal(
    searchWords("Kobbari mithai (coconut burfi)"),
    "kobbari mithai coconut burfi",
  );
  assert.equal(searchWords(" , "), "");
});

test("a query in an Indian script names its Sarvam language", () => {
  assert.equal(sourceLanguage("ಕಾಜು ಕಟ್ಲಿ"), "kn-IN");
  assert.equal(sourceLanguage("काजू कतली"), "hi-IN");
  assert.equal(sourceLanguage("முறுக்கு"), "ta-IN");
  assert.equal(sourceLanguage("అరిసెలు"), "te-IN");
  assert.equal(sourceLanguage("kaju katli"), null);
  assert.equal(sourceLanguage("123"), null);
});
