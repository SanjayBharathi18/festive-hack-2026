import assert from "node:assert/strict";
import { test } from "node:test";
import type { OpsSarvamConfig } from "../../shared/ops.ts";
import { createText } from "../text/text.ts";
import { clockTime, unitsNumber, wholeNumber } from "./console-format.ts";
import { segmentWords, valueWords } from "./flags-model.ts";

const text = createText("en");
const config: OpsSarvamConfig = {
  speech_model: "saaras:v4",
  speech_mode: "codemix",
  reading_model: "sarvam-105b",
  reasoning_effort: null,
  max_tokens: 1024,
  translation_model: "mayura:v1",
};

test("a flag value reads as words: a switch, a value or the Sarvam settings", () => {
  assert.equal(valueWords(true, text), "On");
  assert.equal(valueWords(false, text), "Off");
  assert.equal(valueWords("safe", text), "safe");
  assert.equal(
    valueWords(config, text),
    "saaras:v4 · sarvam-105b · reasoning off · 1,024 maximum tokens",
  );
  assert.match(
    valueWords(
      { ...config, reasoning_effort: "medium", max_tokens: 256 },
      text,
    ),
    /reasoning medium · 256 maximum tokens$/,
  );
});

test("a segment reads with its language, its source and the experiment", () => {
  assert.deepEqual(
    segmentWords(
      {
        segment: "lang_kn",
        language: "kn-IN",
        from: "defaults",
        ops_reading: "ai",
        exp_reading_path: "native",
        in_experiment: false,
        cfg_sarvam: config,
        in_memory: [],
      },
      text,
    ),
    {
      language: "Kannada (kn-IN)",
      from: "Defaults in code",
      experiment: "not in the experiment",
      sarvam: "saaras:v4 · sarvam-105b · reasoning off · 1,024 maximum tokens",
    },
  );
});

test("the console numbers use Indian grouping, and the time is a clock", () => {
  assert.equal(wholeNumber(125000), "1,25,000");
  assert.equal(unitsNumber(12.48), "12.5");
  assert.match(clockTime(Date.parse("2026-11-25T06:30:05Z")), /^\d\d:\d\d:05$/);
});
