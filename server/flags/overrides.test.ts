import assert from "node:assert/strict";
import { test } from "node:test";
import {
  flagDefaults,
  safeSarvam,
  type CfgSarvam,
  type OrderTraits,
} from "./decisions.ts";
import { createDefaultFlags } from "./default-flags.ts";
import { applyOverride, createFlagOverrides } from "./overrides.ts";

const bad: CfgSarvam = {
  ...safeSarvam,
  reasoning_effort: "medium",
  max_tokens: 256,
};

const traits = (language?: string): OrderTraits => ({
  store: "test-kitchen",
  source: "load",
  language,
  is_demo: false,
});

test("an override changes only the orders of its segment", async () => {
  const base = createDefaultFlags();
  const overrides = createFlagOverrides(base);
  overrides.set("lang_kn", { cfg_sarvam: bad });
  const kannada = await overrides.flags.forOrder("a", traits("kn-IN"));
  assert.deepEqual(kannada.cfg_sarvam, bad);
  assert.equal(kannada.ops_reading, "ai");
  assert.equal(kannada.segment, "lang_kn");
  const hindi = await overrides.flags.forOrder("b", traits("hi-IN"));
  assert.deepEqual(hindi.cfg_sarvam, flagDefaults.cfg_sarvam);
  const unknown = await overrides.flags.forOrder("c", traits());
  assert.deepEqual(unknown.cfg_sarvam, flagDefaults.cfg_sarvam);
});

test("set merges values, and remove takes some or all away", async () => {
  const overrides = createFlagOverrides(createDefaultFlags());
  overrides.set("lang_kn", { cfg_sarvam: bad });
  overrides.set("lang_kn", { ops_reading: "safe" });
  assert.deepEqual(overrides.get("lang_kn"), {
    cfg_sarvam: bad,
    ops_reading: "safe",
  });
  overrides.remove("lang_kn", ["ops_reading"]);
  assert.deepEqual(overrides.get("lang_kn"), { cfg_sarvam: bad });
  overrides.remove("lang_kn", ["cfg_sarvam", "ops_reading"]);
  assert.deepEqual(overrides.get("lang_kn"), {});
  const decision = await overrides.flags.forOrder("a", traits("kn-IN"));
  assert.deepEqual(decision.cfg_sarvam, flagDefaults.cfg_sarvam);
});

test("get returns a copy, so a caller cannot change the overrides", () => {
  const overrides = createFlagOverrides(createDefaultFlags());
  overrides.set("lang_kn", { cfg_sarvam: bad });
  const copy = overrides.get("lang_kn");
  if (copy.cfg_sarvam) copy.cfg_sarvam.max_tokens = 4096;
  assert.equal(overrides.get("lang_kn").cfg_sarvam?.max_tokens, 256);
});

test("the other methods of the Flags contract pass through", async () => {
  const base = createDefaultFlags({ ops_translation: "off" });
  const overrides = createFlagOverrides(base);
  assert.equal((await overrides.flags.environment()).ops_translation, "off");
  const decision = await overrides.flags.forOrder("d", traits("kn-IN"));
  overrides.flags.recordExposure(decision);
  overrides.flags.recordConversion("d");
  assert.deepEqual(base.exposures, ["order:d"]);
  assert.deepEqual(base.conversions, ["order:d"]);
});

test("applyOverride leaves a decision with no segment as it is", async () => {
  const decision = await createDefaultFlags().forOrder("e", traits());
  assert.equal(
    applyOverride(decision, new Map([["lang_kn", { ops_reading: "manual" }]])),
    decision,
  );
});
