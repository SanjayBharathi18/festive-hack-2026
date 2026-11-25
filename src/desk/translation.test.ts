import assert from "node:assert/strict";
import { test } from "node:test";
import { isTranslated, shownWords } from "./translation.ts";

const note = "Festive ribbon if handy";
const kannada = { text: "ಸಾಧ್ಯವಾದರೆ ಹಬ್ಬದ ರಿಬ್ಬನ್", language: "kn" } as const;

test("a translated text shows in her language first", () => {
  assert.deepEqual(shownWords(note, kannada, false), {
    text: kannada.text,
    lang: "kn",
    translated: true,
  });
});

test("the original is one switch away", () => {
  assert.deepEqual(shownWords(note, kannada, true), {
    text: note,
    lang: "en",
    translated: false,
  });
});

test("a text with no translation shows as it is, with no badge", () => {
  assert.deepEqual(shownWords(note, null, false), {
    text: note,
    lang: "en",
    translated: false,
  });
  assert.equal(isTranslated(note, null), false);
});

test("a translation that equals the original is not a translation", () => {
  assert.equal(
    isTranslated(note, { text: ` ${note} `, language: "en" }),
    false,
  );
  assert.equal(isTranslated(note, { text: " ", language: "kn" }), false);
  assert.equal(isTranslated(null, kannada), false);
  assert.equal(isTranslated(note, kannada), true);
});

test("the original keeps the language of its script", () => {
  assert.equal(shownWords("ಸಕ್ಕರೆ ಸ್ವಲ್ಪ ಕಡಿಮೆ", null, false).lang, "kn");
  assert.equal(shownWords("12, 4th Cross", null, false).lang, "en");
});
