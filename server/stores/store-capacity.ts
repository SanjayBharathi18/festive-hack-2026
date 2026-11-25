import type { Day } from "../../shared/day.ts";
import type { OrderStatus } from "../../shared/model.ts";
import {
  dayLoads,
  type Amount,
  type BookedOrder,
  type DayRules,
} from "../capacity/capacity.ts";
import type { Db } from "../db/database.ts";
import type { Store } from "./store-data.ts";

export const dayWindow = 21;

export type CapacityStore = Pick<
  Store,
  | "id"
  | "paused"
  | "normal_orders_on"
  | "limit_unit"
  | "daily_limit"
  | "working_days"
  | "last_order_day"
>;

export type StoreCapacity = { rules: DayRules; loads: Map<Day, number> };

type LineRow = {
  order_id: string;
  day: Day;
  status: OrderStatus;
  quantity: number | null;
  grams: number | null;
  pieces: number | null;
};

export function readCapacity(
  db: Db,
  store: CapacityStore,
  from: Day,
  until: Day,
  { exceptOrderId }: { exceptOrderId?: string } = {},
): StoreCapacity {
  const closed = db
    .prepare(
      "SELECT date FROM closed_dates WHERE store_id = ? AND date BETWEEN ? AND ?",
    )
    .pluck()
    .all(store.id, from, until) as Day[];
  const lines = db
    .prepare(
      `SELECT orders.id AS order_id, orders.day, orders.status,
        order_items.quantity, order_items.grams, order_items.pieces
      FROM orders LEFT JOIN order_items ON order_items.order_id = orders.id
      WHERE orders.store_id = ? AND orders.day BETWEEN ? AND ? AND orders.id IS NOT ?`,
    )
    .all(store.id, from, until, exceptOrderId ?? null) as LineRow[];
  const rules = dayRules(store, closed);
  return { rules, loads: dayLoads(rules.limit_unit, bookedOrders(lines)) };
}

export function dayRules(
  store: CapacityStore,
  closedDates: Iterable<Day>,
): DayRules {
  return {
    taking_orders: !store.paused && store.normal_orders_on,
    limit_unit: store.limit_unit,
    daily_limit: store.daily_limit,
    working_days: store.working_days,
    last_order_day: store.last_order_day,
    closed_dates: new Set(closedDates),
  };
}

function bookedOrders(lines: readonly LineRow[]): BookedOrder[] {
  const orders = new Map<string, BookedOrder & { lines: Amount[] }>();
  for (const { order_id, day, status, quantity, grams, pieces } of lines) {
    const order = orders.get(order_id) ?? { day, status, lines: [] };
    if (quantity !== null) order.lines.push({ quantity, grams, pieces });
    orders.set(order_id, order);
  }
  return [...orders.values()];
}
