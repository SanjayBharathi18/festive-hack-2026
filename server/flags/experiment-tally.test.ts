import assert from "node:assert/strict";
import { test } from "node:test";
import { flagDefaults, type OrderFlags } from "./decisions.ts";
import { createDefaultFlags } from "./default-flags.ts";
import { createExperimentTally, rememberedOrders } from "./experiment-tally.ts";

const decision = (orderId: string, variant: string | null): OrderFlags => ({
  identity: `order:${orderId}`,
  ops_reading: "ai",
  cfg_sarvam: flagDefaults.cfg_sarvam,
  exp_reading_path:
    variant === "translate_first" ? "translate_first" : "native",
  in_experiment: variant !== null,
  ...(variant === null ? {} : { experiment: { id: 7, variant } }),
  cfg_demo_trace: false,
  segment: "lang_kn",
  from: "flagsmith",
});

test("the tally counts exposures and conversions by variant, and passes each call on", () => {
  const base = createDefaultFlags();
  const tally = createExperimentTally(base);
  tally.flags.recordExposure(decision("a", "control"));
  tally.flags.recordExposure(decision("b", "translate_first"));
  tally.flags.recordExposure(decision("c", "control"));
  tally.flags.recordConversion("a");
  tally.flags.recordConversion("b");
  tally.flags.recordConversion("z");
  const counts = tally.counts();
  assert.deepEqual(
    counts.exposures,
    new Map([
      ["control", 2],
      ["translate_first", 1],
    ]),
  );
  assert.deepEqual(
    counts.conversions,
    new Map([
      ["control", 1],
      ["translate_first", 1],
    ]),
  );
  assert.equal(counts.outside, 1);
  assert.deepEqual(base.exposures, ["order:a", "order:b", "order:c"]);
  assert.deepEqual(base.conversions, ["order:a", "order:b", "order:z"]);
});

test("an order outside the experiment is not an exposure", () => {
  const tally = createExperimentTally(createDefaultFlags());
  tally.flags.recordExposure(decision("a", null));
  tally.flags.recordConversion("a");
  assert.deepEqual(tally.counts(), {
    exposures: new Map(),
    conversions: new Map(),
    outside: 1,
  });
});

test("reading the decisions through the tally records nothing", async () => {
  const base = createDefaultFlags();
  const tally = createExperimentTally(base);
  await tally.flags.environment();
  await tally.flags.forOrder("a", {
    store: "s",
    source: "desk",
    language: "kn-IN",
    is_demo: false,
  });
  assert.deepEqual(base.exposures, []);
  assert.equal(tally.counts().exposures.size, 0);
});

test("the tally remembers the variants of the newest orders only", () => {
  const tally = createExperimentTally(createDefaultFlags());
  for (let index = 0; index <= rememberedOrders; index += 1) {
    tally.flags.recordExposure(decision(String(index), "control"));
  }
  tally.flags.recordConversion("0");
  tally.flags.recordConversion(String(rememberedOrders));
  const counts = tally.counts();
  assert.equal(counts.exposures.get("control"), rememberedOrders + 1);
  assert.equal(counts.conversions.get("control"), 1);
  assert.equal(counts.outside, 1);
});
