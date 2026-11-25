import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentChoice, paysNow } from "./payment-choice.ts";

const store = (accepts_online: boolean, advance_for_strangers: boolean) => ({
  accepts_online,
  advance_for_strangers,
});

test("a store with no online payments offers no payment step", () => {
  assert.equal(paymentChoice(store(false, true), "market"), "none");
});

test("online payment is optional, except for marketplace buyers when she asks strangers to pay", () => {
  assert.equal(paymentChoice(store(true, false), "market"), "optional");
  assert.equal(paymentChoice(store(true, true), undefined), "optional");
  assert.equal(paymentChoice(store(true, true), "market"), "required");
});

test("the buyer pays now when it is required or when she picks it", () => {
  assert.equal(paysNow("required", null), true);
  assert.equal(paysNow("optional", "now"), true);
  assert.equal(paysNow("optional", "later"), false);
  assert.equal(paysNow("optional", null), false);
  assert.equal(paysNow("none", "now"), false);
});
