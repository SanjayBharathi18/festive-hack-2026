import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrderLine } from "../../shared/orders.ts";
import {
  itemTotals,
  moneyTotals,
  spaceLeft,
  type DailyOrder,
} from "./daily.ts";

const line = (
  item_id: string,
  label: string,
  quantity: number,
  amount: { grams?: number; pieces?: number },
): OrderLine => ({
  item_id,
  pack_id: `${item_id}-${label}`,
  name: item_id,
  label,
  quantity,
  price: 10000,
  grams: amount.grams ?? null,
  pieces: amount.pieces ?? null,
});

const order = (
  status: DailyOrder["status"],
  total: number,
  paid: boolean,
  lines: OrderLine[],
): DailyOrder => ({ day: "2026-11-28", status, total, paid, lines });

test("the money of a day counts each order that is not cancelled", () => {
  assert.deepEqual(
    moneyTotals([
      order("new", 88000, true, []),
      order("ready", 45000, false, []),
      order("cancelled", 99000, true, []),
      order("expired", 99000, false, []),
    ]),
    { orders: 2, value: 133000, paid: 88000, owed: 45000 },
  );
});

test("each item totals its grams, its pieces and its packs", () => {
  assert.deepEqual(
    itemTotals([
      order("new", 0, false, [
        line("mysore-pak", "1 kg", 2, { grams: 1000 }),
        line("gujiya", "6 pcs", 1, { pieces: 6 }),
      ]),
      order("making", 0, false, [
        line("mysore-pak", "500 g", 1, { grams: 500 }),
        line("mysore-pak", "1 kg", 1, { grams: 1000 }),
      ]),
      order("cancelled", 0, false, [line("gujiya", "6 pcs", 5, { pieces: 6 })]),
    ]),
    [
      {
        item_id: "mysore-pak",
        name: "mysore-pak",
        grams: 3500,
        pieces: null,
        packs: [
          { label: "1 kg", quantity: 3 },
          { label: "500 g", quantity: 1 },
        ],
      },
      {
        item_id: "gujiya",
        name: "gujiya",
        grams: null,
        pieces: 6,
        packs: [{ label: "6 pcs", quantity: 1 }],
      },
    ],
  );
});

test("the space left is the limit minus the load, and never below 0", () => {
  assert.equal(spaceLeft(25000, 23000), 2000);
  assert.equal(spaceLeft(25000, 26000), 0);
  assert.equal(spaceLeft(null, 26000), null);
});
