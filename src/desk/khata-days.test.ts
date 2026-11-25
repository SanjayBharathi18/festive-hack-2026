import assert from "node:assert/strict";
import { test } from "node:test";
import { closeStateOf, khataDays, type KhataDay } from "./khata-days.ts";

const saturday: KhataDay = {
  day: "2026-11-28",
  load: 3000,
  space_left: 22_000,
  closed: false,
  orders: 2,
  items: [
    {
      item_id: "086ced7f-5846-8368-9591-69c03683048d",
      name: "ಮೈಸೂರು ಪಾಕ್",
      grams: 3000,
      pieces: null,
      packs: [{ label: "1 kg", quantity: 3 }],
    },
  ],
  value: 264_000,
  paid: 88_000,
  owed: 176_000,
};
const list = { today: "2026-11-24", daily_limit: 25_000, days: [saturday] };

const today = khataDays({ ...list, days: [] }, [], undefined)[0];

test("the khata offers today first, then each day with orders", () => {
  assert.deepEqual(khataDays(list, [], undefined), [today, saturday]);
  assert.deepEqual(today, {
    day: "2026-11-24",
    load: 0,
    space_left: 25_000,
    closed: false,
    orders: 0,
    items: [],
    value: 0,
    paid: 0,
    owed: 0,
  });
  const busy = { ...saturday, day: "2026-11-24" };
  assert.deepEqual(khataDays({ ...list, days: [busy] }, [], undefined), [busy]);
});

test("a closed day shows, also with no orders, and its state comes from her stock", () => {
  const days = khataDays(
    { ...list, days: [{ ...saturday, closed: true }] },
    ["2026-11-29"],
    undefined,
  );
  assert.deepEqual(
    days.map((day) => [day.day, day.closed, day.orders]),
    [
      ["2026-11-24", false, 0],
      ["2026-11-28", false, 2],
      ["2026-11-29", true, 0],
    ],
  );
  assert.deepEqual(days[2], {
    day: "2026-11-29",
    load: 0,
    space_left: 25_000,
    closed: true,
    orders: 0,
    items: [],
    value: 0,
    paid: 0,
    owed: 0,
  });
});

test("the picked day shows in order, with nothing to make", () => {
  const days = khataDays(list, [], "2026-11-25");
  assert.deepEqual(
    days.map((day) => day.day),
    ["2026-11-24", "2026-11-25", "2026-11-28"],
  );
  assert.equal(days[1]?.load, 0);
  assert.deepEqual(khataDays(list, [], "2026-11-28"), [today, saturday]);
});

test("a day with no limit keeps no space left", () => {
  const days = khataDays(
    { ...list, daily_limit: null, days: [] },
    ["2026-11-30"],
    undefined,
  );
  assert.deepEqual(
    days.map((day) => day.space_left),
    [null, null],
  );
});

test("days before today do not show", () => {
  assert.deepEqual(khataDays(list, ["2026-11-20"], "2026-11-23"), [
    today,
    saturday,
  ]);
});

test("a full day says that buyers cannot choose it", () => {
  assert.equal(
    closeStateOf({ closed: false, space_left: 0 }),
    "desk.daily.full_state",
  );
  assert.equal(
    closeStateOf({ closed: true, space_left: 0 }),
    "desk.daily.closed_state",
  );
  assert.equal(
    closeStateOf({ closed: false, space_left: 2000 }),
    "desk.daily.open_state",
  );
  assert.equal(
    closeStateOf({ closed: false, space_left: null }),
    "desk.daily.open_state",
  );
});
