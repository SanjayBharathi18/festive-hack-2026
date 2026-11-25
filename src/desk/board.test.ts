import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeskBoard } from "../../shared/orders.ts";
import { createBoard } from "./board.ts";
import { fakeSlip } from "./test-slips.ts";

const saturday = "2026-11-28";
const sunday = "2026-11-29";

function seeded(): DeskBoard {
  return {
    today: "2026-11-24",
    limit_unit: "kg",
    daily_limit: 25_000,
    days: [
      {
        day: saturday,
        load: 3000,
        space_left: 22_000,
        slips: [
          fakeSlip({ number: 2, day: saturday, grams: 1000 }),
          fakeSlip({ number: 1, day: saturday, grams: 2000 }),
        ],
      },
      {
        day: sunday,
        load: 500,
        space_left: 24_500,
        slips: [fakeSlip({ number: 3, day: sunday, grams: 500 })],
      },
    ],
  };
}

test("the board gives her days in order, with their slips in order", () => {
  const board = createBoard({ unit: "kg", limit: 25_000 });
  board.load(seeded());
  const days = board.days();
  assert.deepEqual(
    days.map((day) => [day.day, day.load, day.spaceLeft]),
    [
      [saturday, 3000, 22_000],
      [sunday, 500, 24_500],
    ],
  );
  assert.deepEqual(
    days[0]?.slips.map((slip) => slip.number),
    [1, 2],
  );
});

test("a cancelled order goes to the end of its day and gives its space back", () => {
  const board = createBoard({ unit: "kg", limit: 25_000 });
  board.load(seeded());
  const first = board.days()[0]?.slips[0];
  assert.ok(first);
  board.put({ ...first, status: "cancelled", next_stamp: null });
  const day = board.dayOf(saturday);
  assert.equal(day?.load, 1000);
  assert.deepEqual(
    day?.slips.map((slip) => slip.number),
    [2, 1],
  );
});

test("a new order makes its day if the day had no orders", () => {
  const board = createBoard({ unit: "kg", limit: 25_000 });
  board.load(seeded());
  board.put(fakeSlip({ number: 4, day: "2026-12-01", grams: 1500 }));
  assert.equal(board.days().length, 3);
  assert.equal(board.dayOf("2026-12-01")?.load, 1500);
});

test("an edit that moves an order moves its slip and its load", () => {
  const board = createBoard({ unit: "kg", limit: 25_000 });
  board.load(seeded());
  const moved = board.days()[1]?.slips[0];
  assert.ok(moved);
  board.put({ ...moved, day: saturday });
  assert.equal(board.dayOf(saturday)?.load, 3500);
  assert.equal(board.dayOf(sunday), undefined);
});

test("days before today are marked as earlier, open days", () => {
  const board = createBoard({ unit: "kg", limit: 25_000 });
  board.load({
    ...seeded(),
    days: [
      {
        day: "2026-11-20",
        load: 1000,
        space_left: 24_000,
        slips: [fakeSlip({ number: 9, day: "2026-11-20", grams: 1000 })],
      },
    ],
  });
  assert.equal(board.days()[0]?.past, true);
});

test("listeners hear each change, and the same slip twice is no change", () => {
  const board = createBoard({ unit: "kg", limit: 25_000 });
  let heard = 0;
  board.subscribe(() => heard++);
  board.load(seeded());
  const slip = board.days()[0]?.slips[0];
  assert.ok(slip);
  board.put(slip);
  board.put({ ...slip, paid: true });
  assert.equal(heard, 2);
});

test("with no daily limit there is no space to count", () => {
  const board = createBoard({ unit: "kg", limit: null });
  board.load({ ...seeded(), daily_limit: null });
  assert.equal(board.days()[0]?.spaceLeft, null);
  assert.equal(board.limit, null);
});
