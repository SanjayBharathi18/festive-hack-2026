import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../db/database.ts";
import { seedStore } from "../test-store.ts";
import { createOrderData } from "./order-data.ts";
import { kiloLine, newOrder, saturday, sunday } from "./test-orders.ts";

function setup() {
  const db = openDatabase(":memory:");
  const store = seedStore(db);
  const other = seedStore(db, {
    slug: "ghar-ki-mithai",
    phone: "+919800000003",
  });
  return { db, store, other, orders: createOrderData(db) };
}

test("each store numbers its orders from 1", () => {
  const { store, other, orders } = setup();
  const first = newOrder(store);
  const second = newOrder(store);
  const elsewhere = newOrder(other);
  for (const order of [first, second, elsewhere]) orders.insert(order, []);
  assert.equal(orders.byId(store.storeId, first.id)?.number, 1);
  assert.equal(orders.byId(store.storeId, second.id)?.number, 2);
  assert.equal(orders.byId(other.storeId, elsewhere.id)?.number, 1);
});

test("an order keeps the price, grams and pieces of each pack, and reads the food mark and Latin name of its dish", () => {
  const { db, store, orders } = setup();
  const order = newOrder(store);
  orders.insert(order, [kiloLine(store, 2)]);
  db.prepare("UPDATE packs SET price = 1 WHERE id = ?").run(
    store.items.mysorePak.packs[2].id,
  );
  const saved = orders.byToken(order.token);
  assert.deepEqual(saved?.lines, [
    { ...kiloLine(store, 2), veg_mark: "veg", name_latin: null },
  ]);
  assert.equal(saved?.store.slug, "shobhas-kitchen");
  assert.equal(saved?.store.sellerPhone, store.phone);
  assert.equal(saved?.store.sellerLanguage, "kn");
});

test("an order is found only in its own store", () => {
  const { store, other, orders } = setup();
  const order = newOrder(store);
  orders.insert(order, []);
  assert.equal(orders.byId(other.storeId, order.id), undefined);
  assert.equal(orders.exists(order.id), true);
  assert.equal(orders.byToken("no-such-token-0000"), undefined);
});

test("the store of an order holds no pin", () => {
  const { store, orders } = setup();
  const order = newOrder(store);
  orders.insert(order, []);
  const saved = orders.byId(store.storeId, order.id);
  assert.ok(saved);
  assert.equal("lat" in saved.store || "lng" in saved.store, false);
});

test("the list takes the days of the range, and open orders before it when asked", () => {
  const { store, other, orders } = setup();
  const open = newOrder(store, { day: "2026-11-23", status: "ready" });
  const done = newOrder(store, { day: "2026-11-23", status: "picked_up" });
  const inRange = newOrder(store, { day: saturday });
  const later = newOrder(store, { day: "2026-12-30" });
  for (const order of [open, done, inRange, later, newOrder(other)]) {
    orders.insert(order, [kiloLine(store)]);
  }
  const ids = (list: { id: string }[]) => list.map((order) => order.id);
  assert.deepEqual(ids(orders.list(store.storeId, saturday, sunday)), [
    inRange.id,
  ]);
  assert.deepEqual(ids(orders.list(store.storeId, saturday, sunday, true)), [
    open.id,
    inRange.id,
  ]);
  assert.equal(
    orders.list(store.storeId, saturday, sunday)[0]?.lines.length,
    1,
  );
});

test("money reads the total and paid of each order in the days", () => {
  const { store, orders } = setup();
  orders.insert(newOrder(store, { total: 100 }), []);
  const paid = newOrder(store, { total: 250 });
  orders.insert(paid, []);
  orders.setPaid(paid.id, true);
  orders.insert(newOrder(store, { day: "2026-12-30", total: 999 }), []);
  assert.deepEqual(orders.money(store.storeId, saturday, sunday), [
    { status: "new", total: 100, paid: false },
    { status: "new", total: 250, paid: true },
  ]);
});

test("a status, the paid stamp and an edit change the order", () => {
  const { store, orders } = setup();
  const order = newOrder(store);
  orders.insert(order, [kiloLine(store)]);
  orders.setStatus(order.id, "cancelled", "day_full");
  orders.setPaid(order.id, true);
  orders.edit(
    order.id,
    {
      fulfilment: "delivery",
      day: sunday,
      address: "Jayanagar",
      note: "less sugar",
      buyerName: "Asha",
      buyerPhone: null,
      total: 176000,
    },
    [kiloLine(store, 2)],
  );
  const saved = orders.byId(store.storeId, order.id);
  assert.equal(saved?.status, "cancelled");
  assert.equal(saved?.cancelReason, "day_full");
  assert.equal(saved?.paid, true);
  assert.equal(saved?.day, sunday);
  assert.equal(saved?.address, "Jayanagar");
  assert.equal(saved?.buyerPhone, null);
  assert.deepEqual(saved?.lines, [
    { ...kiloLine(store, 2), veg_mark: "veg", name_latin: null },
  ]);
});
