import type { Day } from "../../shared/day.ts";
import type { OrderStatus } from "../../shared/model.ts";
import type { DailyItem, OrderLine } from "../../shared/orders.ts";
import { addsLoad } from "../capacity/capacity.ts";

export type DailyOrder = {
  day: Day;
  status: OrderStatus;
  total: number;
  paid: boolean;
  lines: readonly OrderLine[];
};

export type MoneyTotals = {
  orders: number;
  value: number;
  paid: number;
  owed: number;
};

export function moneyTotals(
  orders: readonly Omit<DailyOrder, "day" | "lines">[],
): MoneyTotals {
  const active = orders.filter((order) => addsLoad(order.status));
  const value = sum(active.map((order) => order.total));
  const paid = sum(
    active.filter((order) => order.paid).map((order) => order.total),
  );
  return { orders: active.length, value, paid, owed: value - paid };
}

export function itemTotals(orders: readonly DailyOrder[]): DailyItem[] {
  const items = new Map<string, DailyItem>();
  for (const order of orders) {
    if (!addsLoad(order.status)) continue;
    for (const line of order.lines) {
      const item = items.get(line.item_id) ?? {
        item_id: line.item_id,
        name: line.name,
        grams: null,
        pieces: null,
        packs: [],
      };
      if (line.grams !== null) {
        item.grams = (item.grams ?? 0) + line.grams * line.quantity;
      }
      if (line.pieces !== null) {
        item.pieces = (item.pieces ?? 0) + line.pieces * line.quantity;
      }
      const pack = item.packs.find((entry) => entry.label === line.label);
      if (pack === undefined) {
        item.packs.push({ label: line.label, quantity: line.quantity });
      } else {
        pack.quantity += line.quantity;
      }
      items.set(line.item_id, item);
    }
  }
  return [...items.values()];
}

export function spaceLeft(limit: number | null, load: number): number | null {
  return limit === null ? null : Math.max(0, limit - load);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
