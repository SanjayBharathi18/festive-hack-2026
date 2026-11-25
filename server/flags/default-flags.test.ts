import assert from "node:assert/strict";
import { test } from "node:test";
import { flagDefaults, safeSarvam } from "./decisions.ts";
import { createDefaultFlags } from "./default-flags.ts";

const traits = {
  store: "test-kitchen",
  source: "desk" as const,
  language: "hi-IN",
  is_demo: true,
};

test("environment flags are the defaults in code, with the overrides", async () => {
  assert.deepEqual(await createDefaultFlags().environment(), flagDefaults);
  const values = await createDefaultFlags({
    ops_voice: false,
    ops_reading: "manual",
  }).environment();
  assert.deepEqual(values, {
    ...flagDefaults,
    ops_voice: false,
    ops_reading: "manual",
  });
});

test("the decision for an order uses the defaults, the language segment and no experiment", async () => {
  const flags = createDefaultFlags({ exp_reading_path: "translate_first" });
  assert.deepEqual(await flags.forOrder("abc", traits), {
    identity: "order:abc",
    ops_reading: "ai",
    cfg_sarvam: safeSarvam,
    exp_reading_path: "translate_first",
    in_experiment: false,
    cfg_demo_trace: false,
    segment: "lang_hi",
    from: "defaults",
  });
  const unknown = await flags.forOrder("def", {
    ...traits,
    language: undefined,
  });
  assert.equal(unknown.segment, null);
});

test("exposures and conversions are kept in memory, by identity", async () => {
  const flags = createDefaultFlags();
  const decision = await flags.forOrder("abc", traits);
  flags.recordExposure(decision);
  flags.recordConversion("abc");
  flags.recordConversion("def");
  assert.deepEqual(flags.exposures, ["order:abc"]);
  assert.deepEqual(flags.conversions, ["order:abc", "order:def"]);
  await flags.close(5000);
});
