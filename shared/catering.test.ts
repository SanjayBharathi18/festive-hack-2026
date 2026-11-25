import assert from "node:assert/strict";
import { test } from "node:test";
import { planEstimate, styleExtra } from "./catering.ts";

const silver = {
  price: 35_000,
  style_extras: { staff: 4_000, live_counters: 7_500 },
};

test("each service style adds its own amount to each plate, and delivery adds nothing", () => {
  assert.equal(styleExtra(silver, "delivery"), 0);
  assert.equal(styleExtra(silver, "staff"), 4_000);
  assert.equal(styleExtra(silver, "live_counters"), 7_500);
  assert.equal(planEstimate(silver, 100, "delivery"), 3_500_000);
  assert.equal(planEstimate(silver, 100, "staff"), 3_900_000);
  assert.equal(planEstimate(silver, 100, "live_counters"), 4_250_000);
  assert.equal(
    planEstimate({ ...silver, price: null }, 150, "staff"),
    null,
    "a price on request stays on request",
  );
});
