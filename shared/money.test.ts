import assert from "node:assert/strict";
import { test } from "node:test";
import { paiseSchema } from "./money.ts";

test("paise are whole, non-negative numbers", () => {
  assert.equal(paiseSchema.parse(23000), 23000);
  assert.equal(paiseSchema.parse(0), 0);
  assert.equal(paiseSchema.safeParse(230.5).success, false);
  assert.equal(paiseSchema.safeParse(-100).success, false);
  assert.equal(paiseSchema.safeParse("23000").success, false);
});
