import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cartLoad,
  dayLoad,
  gaugeSegments,
  spaceLeft,
  type Segment,
} from "./load.ts";

const kilo = { quantity: 2, grams: 1000, pieces: null };
const half = { quantity: 1, grams: 500, pieces: null };
const sixPieces = { quantity: 3, grams: null, pieces: 6 };

test("a cart counts in the unit of the limit", () => {
  assert.equal(cartLoad("kg", [kilo, half]), 2500);
  assert.equal(cartLoad("pieces", [sixPieces, kilo]), 18);
  assert.equal(cartLoad("orders", [kilo, half, sixPieces]), 1);
});

test("cancelled and expired orders give their space back", () => {
  const orders = [
    { status: "new" as const, lines: [kilo] },
    { status: "awaiting_payment" as const, lines: [half] },
    { status: "cancelled" as const, lines: [kilo] },
    { status: "expired" as const, lines: [kilo] },
    { status: "delivered" as const, lines: [half] },
  ];
  assert.equal(dayLoad("kg", orders), 3000);
  assert.equal(dayLoad("orders", orders), 3);
});

test("the space left is never below zero, and there is none to count with no limit", () => {
  assert.equal(spaceLeft(25_000, 23_000), 2000);
  assert.equal(spaceLeft(25_000, 26_000), 0);
  assert.equal(spaceLeft(null, 3000), null);
});

test("a kg day has one segment for each kg, 25 at most", () => {
  assert.equal(gaugeSegments("kg", 25_000, 0).length, 25);
  assert.equal(gaugeSegments("kg", 40_000, 0).length, 25);
  assert.equal(gaugeSegments("orders", 15, 0).length, 15);
  assert.equal(gaugeSegments("pieces", 200, 0).length, 25);
});

test("Saturday at 23 of 25 kg has 23 booked and 2 open segments", () => {
  assert.deepEqual(tally(gaugeSegments("kg", 25_000, 23_000)), {
    booked: 23,
    draft: 0,
    open: 2,
  });
});

test("only a full day is all ink", () => {
  assert.deepEqual(tally(gaugeSegments("kg", 25_000, 25_000)), {
    booked: 25,
    draft: 0,
    open: 0,
  });
  assert.deepEqual(tally(gaugeSegments("kg", 25_000, 24_900)), {
    booked: 24,
    draft: 0,
    open: 1,
  });
});

test("a small load still shows one booked segment", () => {
  assert.deepEqual(tally(gaugeSegments("kg", 25_000, 250)), {
    booked: 1,
    draft: 0,
    open: 24,
  });
});

test("a draft that fits is dashed and leaves the rest open", () => {
  assert.deepEqual(tally(gaugeSegments("kg", 25_000, 23_000, 1500)), {
    booked: 23,
    draft: 1,
    open: 1,
  });
  assert.deepEqual(tally(gaugeSegments("orders", 15, 9, 1)), {
    booked: 9,
    draft: 1,
    open: 5,
  });
});

test("a draft over the limit dashes every open segment", () => {
  assert.deepEqual(tally(gaugeSegments("kg", 25_000, 23_000, 2500)), {
    booked: 23,
    draft: 2,
    open: 0,
  });
});

test("a tiny draft still shows one dashed segment", () => {
  assert.deepEqual(tally(gaugeSegments("kg", 25_000, 24_000, 100)), {
    booked: 24,
    draft: 1,
    open: 0,
  });
});

test("segments run booked, then draft, then open", () => {
  assert.deepEqual(gaugeSegments("orders", 5, 2, 1), [
    "booked",
    "booked",
    "draft",
    "open",
    "open",
  ]);
});

function tally(segments: readonly Segment[]) {
  return {
    booked: segments.filter((segment) => segment === "booked").length,
    draft: segments.filter((segment) => segment === "draft").length,
    open: segments.filter((segment) => segment === "open").length,
  };
}
