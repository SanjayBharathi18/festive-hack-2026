import assert from "node:assert/strict";
import { test } from "node:test";
import { splitAtSentences } from "./chunks.ts";

test("short text is one part", () => {
  assert.deepEqual(splitAtSentences(" ಎರಡು ಕೆಜಿ ಕಾಜು ಕಟ್ಲಿ ಬೇಕು. ", 1000), [
    "ಎರಡು ಕೆಜಿ ಕಾಜು ಕಟ್ಲಿ ಬೇಕು.",
  ]);
  assert.deepEqual(splitAtSentences("   ", 1000), []);
});

test("parts end at sentences, including the Devanagari danda", () => {
  const sentence = `${"काजू कतली ".repeat(30).trim()}।`;
  const text = [sentence, sentence, sentence, sentence].join(" ");
  const parts = splitAtSentences(text, 700);
  assert.equal(parts.length, 2);
  for (const part of parts) {
    assert.ok(part.length <= 700);
    assert.ok(part.endsWith("।"));
  }
  assert.equal(parts.join(" "), text);
});

test("a decimal point does not end a sentence", () => {
  assert.deepEqual(splitAtSentences("I need 2.5 kg please. Thank you.", 22), [
    "I need 2.5 kg please.",
    "Thank you.",
  ]);
});

test("a sentence longer than the limit is cut at spaces", () => {
  const sentence = Array.from(
    { length: 300 },
    (_, index) => `word${index}`,
  ).join(" ");
  const parts = splitAtSentences(sentence, 1000);
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(part.length <= 1000);
  assert.equal(parts.join(" "), sentence);
});

test("a word longer than the limit is cut", () => {
  const parts = splitAtSentences("ಕ".repeat(2500), 1000);
  assert.deepEqual(
    parts.map((part) => part.length),
    [1000, 1000, 500],
  );
});
