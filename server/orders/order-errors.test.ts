import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cartError,
  dayError,
  farDayError,
  pastDayError,
} from "./order-errors.ts";

test("each cart problem has its own code", () => {
  assert.equal(cartError({ kind: "unavailable" }).code, "item_unavailable");
  const soldOut = cartError({ kind: "sold_out", name: "Kaju katli" });
  assert.equal(soldOut.code, "item_sold_out");
  assert.equal(soldOut.status, 409);
  assert.match(soldOut.message, /^Kaju katli is sold out\./);
  assert.equal(
    cartError({ kind: "price_changed", name: "Mysore pak" }).code,
    "price_changed",
  );
});

test("a full day names the next day with space", () => {
  const full = dayError({
    day: "2026-11-28",
    reason: "full",
    space_left: 0,
    next_free_day: "2026-11-29",
  });
  assert.equal(full.code, "day_full");
  assert.equal(
    full.message,
    "Saturday, 28 November is full. The next day with space is Sunday, 29 November.",
  );
  const noSpace = dayError({
    day: "2026-11-28",
    reason: "not_enough_space",
    space_left: 500,
    next_free_day: null,
  });
  assert.equal(noSpace.code, "day_full");
  assert.match(noSpace.message, /Pick another day\.$/);
});

test("a closed day says that the store does not take orders for it", () => {
  for (const reason of ["closed", "not_working", "after_last_day"] as const) {
    const error = dayError({
      day: "2026-11-28",
      reason,
      space_left: null,
      next_free_day: null,
    });
    assert.equal(error.code, "day_closed");
    assert.match(error.message, /does not take orders for Saturday/);
  }
});

test("a past day and a day too far ahead say which days to pick", () => {
  const past = pastDayError();
  assert.equal(past.code, "day_past");
  assert.equal(past.status, 400);
  const far = farDayError("2026-12-14");
  assert.equal(far.code, "day_too_far");
  assert.match(far.message, /up to Monday, 14 December\.$/);
});
