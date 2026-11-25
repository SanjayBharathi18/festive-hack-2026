import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrderStatus } from "../../shared/model.ts";
import { openDatabase, type Db } from "../db/database.ts";
import {
  dayRules,
  readCapacity,
  type CapacityStore,
} from "./store-capacity.ts";

const saturday = "2026-11-28";
const sunday = "2026-11-29";

const kgStore: CapacityStore = {
  id: "store-kg",
  paused: false,
  normal_orders_on: true,
  limit_unit: "kg",
  daily_limit: 25_000,
  working_days: 127,
  last_order_day: null,
};
const ordersStore: CapacityStore = {
  ...kgStore,
  id: "store-orders",
  limit_unit: "orders",
  daily_limit: 15,
};

type Line = [quantity: number, grams: number | null, pieces: number | null];

let orderCount = 0;

function capacityDb(): Db {
  const db = openDatabase(":memory:");
  db.prepare(
    "INSERT INTO sellers (id, phone, language) VALUES ('s1', '+910000000001', 'kn')",
  ).run();
  for (const id of [kgStore.id, ordersStore.id, "store-other"]) {
    db.prepare(
      "INSERT INTO stores (id, seller_id, slug, name) VALUES (?, 's1', ?, 'Store')",
    ).run(id, id);
    db.prepare(
      "INSERT INTO items (id, store_id, name, category, veg_mark) VALUES (?, ?, 'Mysore pak', 'sweets', 'veg')",
    ).run(`item-${id}`, id);
  }
  return db;
}

function addOrder(
  db: Db,
  storeId: string,
  day: string,
  lines: Line[],
  status: OrderStatus = "new",
): string {
  orderCount += 1;
  const id = `order-${orderCount}`;
  db.prepare(
    `INSERT INTO orders (id, store_id, number, token, source, status, fulfilment, day, total, created_at)
    VALUES (?, ?, ?, ?, 'link', ?, 'pickup', ?, 0, 1)`,
  ).run(
    id,
    storeId,
    orderCount,
    `token-${String(orderCount).padStart(16, "0")}`,
    status,
    day,
  );
  for (const [quantity, grams, pieces] of lines) {
    db.prepare(
      "INSERT INTO order_items (order_id, item_id, quantity, price, grams, pieces) VALUES (?, ?, ?, 0, ?, ?)",
    ).run(id, `item-${storeId}`, quantity, grams, pieces);
  }
  return id;
}

test("readCapacity adds up the order lines of each day in the unit of her limit", () => {
  const db = capacityDb();
  addOrder(db, kgStore.id, saturday, [
    [2, 1000, null],
    [1, 500, null],
  ]);
  addOrder(db, kgStore.id, saturday, [[1, 250, null]], "awaiting_payment");
  addOrder(db, kgStore.id, saturday, [[9, 1000, null]], "cancelled");
  addOrder(db, kgStore.id, sunday, [[3, 1000, null]]);
  const { loads } = readCapacity(db, kgStore, saturday, sunday);
  assert.deepEqual(
    [...loads],
    [
      [saturday, 2750],
      [sunday, 3000],
    ],
  );
});

test("readCapacity reads only the days of the range and the orders of the store", () => {
  const db = capacityDb();
  addOrder(db, kgStore.id, "2026-11-27", [[1, 1000, null]]);
  addOrder(db, kgStore.id, saturday, [[1, 1000, null]]);
  addOrder(db, kgStore.id, "2026-11-30", [[1, 1000, null]]);
  addOrder(db, "store-other", saturday, [[5, 1000, null]]);
  const { loads } = readCapacity(db, kgStore, saturday, sunday);
  assert.deepEqual([...loads], [[saturday, 1000]]);
});

test("an order with no items is one order for an orders limit and no weight for a kg limit", () => {
  const db = capacityDb();
  addOrder(db, ordersStore.id, saturday, []);
  addOrder(db, ordersStore.id, saturday, [
    [2, 1000, null],
    [1, 500, null],
  ]);
  addOrder(db, kgStore.id, saturday, []);
  addOrder(db, kgStore.id, saturday, [[1, 1000, null]]);
  assert.equal(
    readCapacity(db, ordersStore, saturday, saturday).loads.get(saturday),
    2,
  );
  assert.equal(
    readCapacity(db, kgStore, saturday, saturday).loads.get(saturday),
    1000,
  );
});

test("exceptOrderId leaves out the order that she edits, and only that order", () => {
  const db = capacityDb();
  const edited = addOrder(db, kgStore.id, saturday, [[3, 1000, null]]);
  addOrder(db, kgStore.id, saturday, [[2, 1000, null]]);
  const all = readCapacity(db, kgStore, saturday, saturday);
  const others = readCapacity(db, kgStore, saturday, saturday, {
    exceptOrderId: edited,
  });
  assert.equal(all.loads.get(saturday), 5000);
  assert.equal(others.loads.get(saturday), 2000);
  const unknown = readCapacity(db, kgStore, saturday, saturday, {
    exceptOrderId: "no-such-order",
  });
  assert.equal(unknown.loads.get(saturday), 5000);
});

test("readCapacity gives the rules of the store with the closed dates of the range", () => {
  const db = capacityDb();
  db.prepare(
    "INSERT INTO closed_dates (store_id, date) VALUES (?, '2026-11-27'), (?, ?), (?, '2026-11-30'), ('store-other', ?)",
  ).run(kgStore.id, kgStore.id, sunday, kgStore.id, saturday);
  const { rules } = readCapacity(db, kgStore, saturday, sunday);
  assert.deepEqual(rules, {
    taking_orders: true,
    limit_unit: "kg",
    daily_limit: 25_000,
    working_days: 127,
    last_order_day: null,
    closed_dates: new Set([sunday]),
  });
});

test("dayRules takes orders only when the store is not paused and normal orders are on", () => {
  const taking = (store: Partial<CapacityStore>) =>
    dayRules({ ...kgStore, ...store }, []).taking_orders;
  assert.equal(taking({}), true);
  assert.equal(taking({ paused: true }), false);
  assert.equal(taking({ normal_orders_on: false }), false);
  assert.equal(taking({ paused: true, normal_orders_on: false }), false);
  const rules = dayRules(
    { ...ordersStore, last_order_day: "2026-12-10", working_days: 62 },
    [saturday, sunday, saturday],
  );
  assert.deepEqual(
    [
      rules.limit_unit,
      rules.daily_limit,
      rules.working_days,
      rules.last_order_day,
    ],
    ["orders", 15, 62, "2026-12-10"],
  );
  assert.deepEqual([...rules.closed_dates], [saturday, sunday]);
});
