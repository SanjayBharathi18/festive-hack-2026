import assert from "node:assert/strict";
import { test } from "node:test";
import lines from "../../fixtures/sarvam/voice-lines.json" with { type: "json" };
import { pickSamples, sampleIds } from "./samples.ts";

const words = {
  name: (language: string) =>
    new Intl.DisplayNames(["en"], { type: "language" }).of(language) ??
    language,
  mix: (name: string) => `${name} and English`,
};

test("each sample id is a voice line of the demo data", () => {
  const samples = pickSamples(lines, sampleIds, words);
  assert.deepEqual(
    samples.map((sample) => sample.id),
    [...sampleIds],
  );
});

test("a sample is named by its language, and a Latin line as a mix", () => {
  const samples = pickSamples(
    [
      { id: "A", language: "kn-IN", text: "ಶನಿವಾರಕ್ಕೆ ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್" },
      { id: "B", language: "kn-IN", text: "Saturday ge Mysore pak 2 kg" },
      { id: "C", language: "en-IN", text: "One kilo of Mysore pak" },
    ],
    ["C", "A", "B"],
    words,
  );
  assert.deepEqual(
    samples.map(({ id, label, lang }) => ({ id, label, lang })),
    [
      { id: "C", label: "English", lang: "en" },
      { id: "A", label: "Kannada", lang: "kn" },
      { id: "B", label: "Kannada and English", lang: "en" },
    ],
  );
});

test("an id with no voice line is left out", () => {
  assert.deepEqual(pickSamples([], ["VK1"], words), []);
});
