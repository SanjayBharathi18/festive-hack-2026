import assert from "node:assert/strict";
import { test } from "node:test";
import {
  byHand,
  isOpen,
  isStamp,
  nextStamp,
  stampKind,
  tiltOf,
} from "./stamps.ts";

test("a slip goes NEW, MAKING, READY, then DELIVERED or PICKED UP", () => {
  assert.equal(nextStamp("new", "delivery"), "making");
  assert.equal(nextStamp("making", "pickup"), "ready");
  assert.equal(nextStamp("ready", "delivery"), "delivered");
  assert.equal(nextStamp("ready", "pickup"), "picked_up");
});

test("a finished, cancelled or unpaid order takes no next stamp", () => {
  for (const status of [
    "delivered",
    "picked_up",
    "cancelled",
    "expired",
    "awaiting_payment",
  ] as const) {
    assert.equal(nextStamp(status, "pickup"), null, status);
  }
});

test("only the five stamp statuses are stamps", () => {
  assert.equal(isStamp("making"), true);
  assert.equal(isStamp("picked_up"), true);
  assert.equal(isStamp("cancelled"), false);
  assert.equal(isStamp("awaiting_payment"), false);
});

test("open orders can still change", () => {
  assert.equal(isOpen("ready"), true);
  assert.equal(isOpen("awaiting_payment"), true);
  assert.equal(isOpen("delivered"), false);
  assert.equal(isOpen("cancelled"), false);
});

test("NEW and MAKING still need her; the rest are finished", () => {
  assert.equal(stampKind("new"), "needs");
  assert.equal(stampKind("making"), "needs");
  assert.equal(stampKind("ready"), "done");
  assert.equal(stampKind("picked_up"), "done");
});

test("NEW is the system's stamp; every later status is her hand", () => {
  assert.equal(byHand("new"), false);
  assert.equal(byHand("making"), true);
  assert.equal(byHand("delivered"), true);
});

test("the tilt is 3° to one side, and the same each time for an order", () => {
  const id = "d878d1f2-4699-41a1-b86b-f4c502a8c0a2";
  assert.equal(tiltOf(id), tiltOf(id));
  const tilts = new Set(
    [
      "d878d1f2-4699-41a1-b86b-f4c502a8c0a2",
      "5b100b90-c20d-418e-8c0e-2d593dda1118",
      "086ced7f-5846-8368-9591-69c03683048d",
      "4f9f59d3-f7cf-85fe-ade6-078c144790e1",
    ].map(tiltOf),
  );
  assert.deepEqual([...tilts].sort(), ["-3deg", "3deg"]);
});
