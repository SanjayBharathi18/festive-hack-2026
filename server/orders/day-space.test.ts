import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../db/database.ts";
import { publishedStoreById } from "../stores/store-data.ts";
import { seedStore, type StoreOptions } from "../test-store.ts";
import { daySpace, sellerDaySpace } from "./day-space.ts";
import { createOrderData } from "./order-data.ts";
import { kiloLine, newOrder, saturday, sunday } from "./test-orders.ts";

function setup(options: StoreOptions = {}) {
  const db = openDatabase(":memory:");
  const seeded = seedStore(db, options);
  const store = publishedStoreById(db, seeded.storeId);
  assert.ok(store);
  const orders = createOrderData(db);
  const big = newOrder(seeded);
  orders.insert(big, [kiloLine(seeded, 24)]);
  return { db, seeded, store, big };
}

const kilos = (quantity: number) => [{ quantity, grams: 1000, pieces: null }];

test("a cart that fits gives no warning", () => {
  const { db, store } = setup();
  assert.equal(daySpace(db, store, saturday, kilos(1)), null);
});

test("a cart over the limit gives the space left and the next day with space", () => {
  const { db, store } = setup();
  assert.deepEqual(daySpace(db, store, saturday, kilos(2)), {
    day: saturday,
    reason: "not_enough_space",
    space_left: 1000,
    next_free_day: sunday,
  });
});

test("an edit leaves its own order out of the load", () => {
  const { db, store, big } = setup();
  assert.equal(daySpace(db, store, saturday, kilos(25), big.id), null);
});

test("a closed date gives its reason", () => {
  const { db, store } = setup();
  db.prepare("INSERT INTO closed_dates (store_id, date) VALUES (?, ?)").run(
    store.id,
    sunday,
  );
  assert.equal(daySpace(db, store, sunday, kilos(1))?.reason, "closed");
});

test("a paused store warns a buyer, but not the seller who adds an order", () => {
  const { db, store } = setup({ paused: true });
  assert.equal(
    daySpace(db, store, sunday, kilos(1))?.reason,
    "not_taking_orders",
  );
  assert.equal(sellerDaySpace(db, store, sunday, kilos(1)), null);
  assert.equal(
    sellerDaySpace(db, store, saturday, kilos(2))?.reason,
    "not_enough_space",
  );
});
