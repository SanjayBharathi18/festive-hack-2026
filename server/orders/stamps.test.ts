import assert from "node:assert/strict";
import { test } from "node:test";
import { orderStatusSchema } from "../../shared/model.ts";
import { canStamp, isOpen, nextStamp, previousStamp } from "./stamps.ts";

test("stamps go NEW, MAKING, READY, then PICKED UP for a pickup order", () => {
  assert.equal(nextStamp("new", "pickup"), "making");
  assert.equal(nextStamp("making", "pickup"), "ready");
  assert.equal(nextStamp("ready", "pickup"), "picked_up");
  assert.equal(nextStamp("picked_up", "pickup"), null);
});

test("a delivery order ends DELIVERED", () => {
  assert.equal(nextStamp("ready", "delivery"), "delivered");
  assert.equal(canStamp("ready", "delivery", "picked_up"), false);
  assert.equal(canStamp("ready", "pickup", "delivered"), false);
});

test("a stamp cannot skip a step", () => {
  assert.equal(canStamp("new", "pickup", "ready"), false);
  assert.equal(canStamp("new", "pickup", "picked_up"), false);
  assert.equal(canStamp("making", "delivery", "delivered"), false);
});

test("a stamp can go back one step, as an undo", () => {
  assert.equal(previousStamp("making"), "new");
  assert.equal(previousStamp("picked_up"), "ready");
  assert.equal(canStamp("ready", "pickup", "making"), true);
  assert.equal(canStamp("ready", "pickup", "new"), false);
  assert.equal(previousStamp("new"), null);
});

test("the same stamp again changes nothing and is allowed", () => {
  assert.equal(canStamp("making", "pickup", "making"), true);
});

test("cancelled and expired orders take no stamps", () => {
  for (const status of ["cancelled", "expired"] as const) {
    assert.equal(nextStamp(status, "pickup"), null);
    assert.equal(canStamp(status, "pickup", "new"), false);
    assert.equal(canStamp(status, "pickup", "making"), false);
  }
});

test("only orders that are not complete can change", () => {
  assert.deepEqual(orderStatusSchema.options.filter(isOpen), [
    "awaiting_payment",
    "new",
    "making",
    "ready",
  ]);
});
