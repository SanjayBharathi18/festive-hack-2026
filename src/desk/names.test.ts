import assert from "node:assert/strict";
import { test } from "node:test";
import { languageOfText } from "./names.ts";

test("the language of a text follows its script", () => {
  assert.equal(languageOfText("ಪ್ರಿಯಾ"), "kn");
  assert.equal(languageOfText("रोहित"), "hi");
  assert.equal(languageOfText("முறுக்கு"), "ta");
  assert.equal(languageOfText("చెక్కలు"), "te");
  assert.equal(languageOfText("Lakshmi Rao"), "en");
  assert.equal(languageOfText("₹880 · 2"), undefined);
});

test("the first Indian script wins in mixed speech", () => {
  assert.equal(languageOfText("Saturday ge ಮೈಸೂರು ಪಾಕ್ 2 kg"), "kn");
});
