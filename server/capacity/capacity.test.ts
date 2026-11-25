import assert from "node:assert/strict";
import { test } from "node:test";
import type { LimitUnit, OrderStatus } from "../../shared/model.ts";
import {
  addsLoad,
  cartLoad,
  checkDay,
  checkDays,
  dayLoads,
  nextFreeDay,
  orderLoad,
  type Amount,
  type BookedOrder,
  type DayRules,
} from "./capacity.ts";

const saturday = "2026-11-28";
const sunday = "2026-11-29";
const monday = "2026-11-30";

const kilo: Amount = { quantity: 1, grams: 1000, pieces: null };
const halfKilo: Amount = { quantity: 1, grams: 500, pieces: null };
const dozen: Amount = { quantity: 1, grams: 480, pieces: 12 };

function kilos(quantity: number): Amount {
  return { ...kilo, quantity };
}

function rules(overrides: Partial<DayRules> = {}): DayRules {
  return {
    taking_orders: true,
    limit_unit: "kg",
    daily_limit: 25_000,
    working_days: 127,
    last_order_day: null,
    closed_dates: new Set(),
    ...overrides,
  };
}

function booked(
  day: string,
  lines: Amount[],
  status: OrderStatus = "new",
): BookedOrder {
  return { day, status, lines };
}

test("an order loads a day in the unit of her limit", () => {
  const lines = [kilos(2), halfKilo, { ...dozen, quantity: 2 }];
  const loads: [LimitUnit, number][] = [
    ["orders", 1],
    ["kg", 2000 + 500 + 960],
    ["pieces", 24],
  ];
  for (const [unit, load] of loads) {
    assert.equal(cartLoad(unit, lines), load, unit);
  }
});

test("an empty cart is one order for an orders limit and nothing otherwise", () => {
  assert.equal(cartLoad("orders", []), 1);
  assert.equal(cartLoad("kg", []), 0);
  assert.equal(cartLoad("pieces", []), 0);
});

test("a pack with no amount in her unit adds nothing", () => {
  assert.equal(cartLoad("pieces", [kilo]), 0);
  assert.equal(
    cartLoad("kg", [{ quantity: 3, grams: null, pieces: 6 }, halfKilo]),
    500,
  );
});

test("awaiting_payment adds load, while cancelled and expired add none", () => {
  const counted: OrderStatus[] = [
    "awaiting_payment",
    "new",
    "making",
    "ready",
    "delivered",
    "picked_up",
  ];
  for (const status of counted) {
    assert.equal(addsLoad(status), true, status);
    assert.equal(orderLoad("kg", { status, lines: [kilo] }), 1000, status);
  }
  for (const status of ["cancelled", "expired"] as const) {
    assert.equal(addsLoad(status), false, status);
    assert.equal(orderLoad("kg", { status, lines: [kilo] }), 0, status);
    assert.equal(orderLoad("orders", { status, lines: [kilo] }), 0, status);
  }
});

test("dayLoads adds up the orders of each day", () => {
  const loads = dayLoads("kg", [
    booked(saturday, [kilos(2)]),
    booked(saturday, [halfKilo], "awaiting_payment"),
    booked(saturday, [kilos(5)], "cancelled"),
    booked(sunday, [kilo]),
    booked(sunday, [kilos(3)], "expired"),
  ]);
  assert.deepEqual(
    [...loads],
    [
      [saturday, 2500],
      [sunday, 1000],
    ],
  );
  const orders = dayLoads("orders", [
    booked(saturday, [kilos(2)]),
    booked(saturday, [halfKilo]),
    booked(saturday, [kilo], "cancelled"),
  ]);
  assert.equal(orders.get(saturday), 2);
});

test("a cart fits when the load plus the cart is not more than the limit", () => {
  const loads = new Map([[saturday, 23_000]]);
  assert.deepEqual(checkDay(rules(), loads, [kilos(2)], saturday), {
    day: saturday,
    fits: true,
    reason: null,
    space_left: 2000,
  });
  assert.deepEqual(checkDay(rules(), loads, [kilos(3)], saturday), {
    day: saturday,
    fits: false,
    reason: "not_enough_space",
    space_left: 2000,
  });
});

test("a day at its limit is full, even for an empty cart", () => {
  const loads = new Map([[saturday, 25_000]]);
  assert.deepEqual(checkDay(rules(), loads, [], saturday), {
    day: saturday,
    fits: false,
    reason: "full",
    space_left: 0,
  });
  const over = new Map([[saturday, 26_000]]);
  assert.equal(checkDay(rules(), over, [], saturday).space_left, 0);
});

test("an orders limit counts each cart as one order", () => {
  const orderRules = rules({ limit_unit: "orders", daily_limit: 15 });
  const loads = new Map([
    [saturday, 14],
    [sunday, 15],
  ]);
  const big = [kilos(9)];
  assert.equal(checkDay(orderRules, loads, big, saturday).fits, true);
  assert.equal(checkDay(orderRules, loads, big, sunday).reason, "full");
});

test("a pieces limit counts the pieces of each pack", () => {
  const pieceRules = rules({ limit_unit: "pieces", daily_limit: 100 });
  const loads = new Map([[saturday, 80]]);
  assert.equal(
    checkDay(pieceRules, loads, [{ ...dozen, quantity: 1 }], saturday).fits,
    true,
  );
  assert.equal(
    checkDay(pieceRules, loads, [{ ...dozen, quantity: 2 }], saturday).reason,
    "not_enough_space",
  );
});

test("a store with no daily limit fits any cart on an open working day", () => {
  const open = rules({ daily_limit: null });
  const loads = new Map([[saturday, 900_000]]);
  assert.deepEqual(checkDay(open, loads, [kilos(500)], saturday), {
    day: saturday,
    fits: true,
    reason: null,
    space_left: null,
  });
  const closed = rules({ daily_limit: null, closed_dates: new Set([sunday]) });
  assert.equal(checkDay(closed, loads, [], sunday).reason, "closed");
});

test("closed dates, days off and days after the last day do not fit", () => {
  const weekdaysOnly = 0b0111110;
  const shut = rules({
    working_days: weekdaysOnly,
    closed_dates: new Set([monday]),
    last_order_day: "2026-12-01",
  });
  const empty = new Map<string, number>();
  const reasons = checkDays(shut, empty, [kilo], saturday, "2026-12-02").map(
    ({ day, reason }) => [day, reason],
  );
  assert.deepEqual(reasons, [
    [saturday, "not_working"],
    [sunday, "not_working"],
    [monday, "closed"],
    ["2026-12-01", null],
    ["2026-12-02", "after_last_day"],
  ]);
  assert.equal(checkDay(shut, empty, [kilo], monday).space_left, null);
});

test("the last day for orders is still open", () => {
  const last = rules({ last_order_day: saturday });
  assert.equal(checkDay(last, new Map(), [kilo], saturday).fits, true);
  assert.equal(
    checkDay(last, new Map(), [kilo], sunday).reason,
    "after_last_day",
  );
});

test("a paused store fits no cart on any day", () => {
  const paused = rules({ taking_orders: false, daily_limit: null });
  const checks = checkDays(paused, new Map(), [], saturday, monday);
  assert.equal(checks.length, 3);
  for (const check of checks) {
    assert.deepEqual(
      [check.fits, check.reason, check.space_left],
      [false, "not_taking_orders", null],
    );
  }
});

test("checkDays covers each day from the first to the last, inclusive", () => {
  const days = checkDays(rules(), new Map(), [], "2026-11-30", "2026-12-02");
  assert.deepEqual(
    days.map(({ day }) => day),
    ["2026-11-30", "2026-12-01", "2026-12-02"],
  );
  assert.deepEqual(checkDays(rules(), new Map(), [], sunday, saturday), []);
});

test("the next free day is the first day from a date where the cart fits", () => {
  const loads = new Map([
    [saturday, 23_000],
    [sunday, 24_500],
  ]);
  const shut = rules({ closed_dates: new Set([monday]) });
  assert.equal(
    nextFreeDay(shut, loads, [kilos(2)], saturday, "2026-12-05"),
    saturday,
  );
  assert.equal(
    nextFreeDay(shut, loads, [kilos(3)], saturday, "2026-12-05"),
    "2026-12-01",
  );
  assert.equal(nextFreeDay(shut, loads, [halfKilo], sunday, monday), sunday);
});

test("there is no next free day when nothing fits until the last date", () => {
  const loads = new Map([
    [saturday, 25_000],
    [sunday, 25_000],
  ]);
  assert.equal(nextFreeDay(rules(), loads, [], saturday, sunday), null);
  assert.equal(
    nextFreeDay(rules(), new Map(), [kilos(26)], saturday, monday),
    null,
  );
  const ended = rules({ last_order_day: "2026-11-27" });
  assert.equal(nextFreeDay(ended, new Map(), [], saturday, monday), null);
});
