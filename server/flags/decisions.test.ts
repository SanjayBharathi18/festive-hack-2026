import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cfgSarvamSchema,
  experimentPathSchema,
  flagDefaults,
  flagSchemas,
  flagVariants,
  languageSegments,
  orderIdentity,
  readingPathSchema,
  safeSarvam,
  segmentFor,
  variantKeys,
  type FlagName,
  type OrderFlags,
} from "./decisions.ts";

const samples: Record<FlagName, { valid: unknown; invalid: unknown }> = {
  ops_voice: { valid: false, invalid: "off" },
  ops_reading: { valid: "manual", invalid: "AI" },
  ops_suggestions: { valid: "off", invalid: "plain" },
  ops_search: { valid: "plain", invalid: "off" },
  ops_transliteration: { valid: "off", invalid: "plain" },
  ops_translation: { valid: "off", invalid: "wordlist" },
  ops_review_check: { valid: "wordlist", invalid: "off" },
  exp_reading_path: { valid: "translate_first", invalid: "translate-first" },
  cfg_sarvam: { valid: safeSarvam, invalid: JSON.stringify(safeSarvam) },
  cfg_demo_trace: { valid: true, invalid: null },
};

const decision: OrderFlags = {
  identity: "order:abc",
  ops_reading: "safe",
  cfg_sarvam: safeSarvam,
  exp_reading_path: "translate_first",
  in_experiment: true,
  experiment: { id: 7, variant: "translate_first" },
  cfg_demo_trace: false,
  segment: "lang_kn",
  from: "flagsmith",
};

test("the reading path is ai, safe or manual", () => {
  assert.equal(readingPathSchema.safeParse("safe").success, true);
  assert.equal(readingPathSchema.safeParse("Safe").success, false);
});

test("the experiment path is native or translate_first, and each has its variant key", () => {
  assert.equal(experimentPathSchema.safeParse("native").success, true);
  assert.equal(experimentPathSchema.safeParse("control").success, false);
  assert.deepEqual(variantKeys, {
    native: "control",
    translate_first: "translate_first",
  });
});

test("cfg_sarvam takes the safe setting, and refuses a bad field", () => {
  assert.deepEqual(cfgSarvamSchema.parse(safeSarvam), safeSarvam);
  assert.equal(
    cfgSarvamSchema.safeParse({ ...safeSarvam, reasoning_effort: "medium" })
      .success,
    true,
  );
  for (const bad of [
    { ...safeSarvam, max_tokens: 0 },
    { ...safeSarvam, max_tokens: 4097 },
    { ...safeSarvam, max_tokens: 256.5 },
    { ...safeSarvam, reasoning_effort: "none" },
    { ...safeSarvam, speech_model: "" },
    { speech_model: "saaras:v4" },
  ]) {
    assert.equal(
      cfgSarvamSchema.safeParse(bad).success,
      false,
      JSON.stringify(bad),
    );
  }
});

test("the safe setting has reasoning off and 1,024 maximum tokens", () => {
  assert.equal(safeSarvam.reasoning_effort, null);
  assert.equal(safeSarvam.max_tokens, 1024);
});

test("each flag schema takes one valid value and refuses one invalid value", () => {
  assert.deepEqual(Object.keys(samples), Object.keys(flagSchemas));
  for (const name of Object.keys(samples) as FlagName[]) {
    const { valid, invalid } = samples[name];
    assert.equal(flagSchemas[name].safeParse(valid).success, true, name);
    assert.equal(flagSchemas[name].safeParse(invalid).success, false, name);
  }
});

test("each default in code is valid for its flag, and the defaults are the table in docs/system.md", () => {
  for (const name of Object.keys(flagSchemas) as FlagName[]) {
    assert.equal(
      flagSchemas[name].safeParse(flagDefaults[name]).success,
      true,
      name,
    );
  }
  assert.deepEqual(flagDefaults, {
    ops_voice: true,
    ops_reading: "ai",
    ops_suggestions: "ai",
    ops_search: "ai",
    ops_transliteration: "ai",
    ops_translation: "ai",
    ops_review_check: "ai",
    exp_reading_path: "native",
    cfg_sarvam: safeSarvam,
    cfg_demo_trace: false,
  });
});

test("the identity of an order is order: and its id", () => {
  assert.equal(
    orderIdentity("0f8e2c1a-4b7d-4c3e-9a51-2d6f7b8c9e0a"),
    "order:0f8e2c1a-4b7d-4c3e-9a51-2d6f7b8c9e0a",
  );
});

test("the segment comes from the language trait, with exact matches only", () => {
  assert.deepEqual(languageSegments, {
    "kn-IN": "lang_kn",
    "hi-IN": "lang_hi",
    "en-IN": "lang_en",
  });
  assert.equal(segmentFor("kn-IN"), "lang_kn");
  assert.equal(segmentFor("hi-IN"), "lang_hi");
  assert.equal(segmentFor("en-IN"), "lang_en");
  for (const other of ["ta-IN", "KN-IN", "kn", "", "constructor", undefined]) {
    assert.equal(segmentFor(other), null, String(other));
  }
});

test("flagVariants names the variants for the request log", () => {
  assert.deepEqual(flagVariants(decision), {
    ops_reading: "safe",
    exp_reading_path: "translate_first",
    segment: "lang_kn",
    flags_from: "flagsmith",
  });
  assert.equal(flagVariants({ ...decision, segment: null }).segment, "none");
});
