import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../db/database.ts";
import { seedStore } from "../test-store.ts";
import { searchForm } from "./search-form.ts";
import { createSearchIndex } from "./search-index.ts";

function setup() {
  const db = openDatabase(":memory:");
  const store = seedStore(db);
  const index = createSearchIndex(db);
  index.sync();
  return { db, store, index };
}

const ids = (hits: readonly { id: string }[]) =>
  hits.map(({ id }) => id).sort();

test("the index finds an item by any part of its Latin form", () => {
  const { store, index } = setup();
  assert.deepEqual(ids(index.trigram("katli")), [store.items.kajuKatli.id]);
  assert.deepEqual(ids(index.trigram("kajukatli")), [store.items.kajuKatli.id]);
  assert.deepEqual(index.trigram("rasgula"), []);
});

test("the index finds a store by its name", () => {
  const { store, index } = setup();
  assert.deepEqual(index.trigram("shobha"), [
    { kind: "store", id: store.storeId, store_id: store.storeId },
  ]);
});

test("an item with a Latin form is found by it, not by her script", () => {
  const { db, store, index } = setup();
  db.prepare("UPDATE items SET name = ?, name_latin = ? WHERE id = ?").run(
    "ಮೈಸೂರು ಪಾಕ್",
    "Mysore pak",
    store.items.mysorePak.id,
  );
  index.sync();
  assert.deepEqual(ids(index.trigram(searchForm("ಮೈಸೂರು"))), []);
  assert.deepEqual(ids(index.trigram("mysorepak")), [store.items.mysorePak.id]);
});

test("a query of one or two letters matches the start of a word", () => {
  const { store, index } = setup();
  assert.deepEqual(ids(index.prefix("ka")), [store.items.kajuKatli.id]);
  assert.deepEqual(ids(index.prefix("pa")), [store.items.mysorePak.id]);
  assert.deepEqual(ids(index.prefix("tl")), []);
});

test("new, renamed and deleted rows reach the index at the next sync", () => {
  const { db, store, index } = setup();
  db.prepare(
    "INSERT INTO items (id, store_id, name, category, veg_mark) VALUES (?, ?, 'Rava laddu', 'sweets', 'veg')",
  ).run("0f6a9b8c-7d6e-4f5a-9b8c-7d6e5f4a3b2c", store.storeId);
  db.prepare("UPDATE stores SET name = 'Amma Sweets' WHERE id = ?").run(
    store.storeId,
  );
  db.prepare("DELETE FROM packs WHERE item_id = ?").run(
    store.items.chakkuli.id,
  );
  db.prepare("DELETE FROM items WHERE id = ?").run(store.items.chakkuli.id);
  assert.deepEqual(index.trigram("ravaladdu"), []);
  index.sync();
  assert.deepEqual(ids(index.trigram("ravaladdu")), [
    "0f6a9b8c-7d6e-4f5a-9b8c-7d6e5f4a3b2c",
  ]);
  assert.deepEqual(index.trigram("shobha"), []);
  assert.equal(index.trigram(searchForm("Amma Sweets")).length, 1);
  assert.deepEqual(index.trigram("chakkuli"), []);
  assert.equal(
    db.prepare("SELECT count(*) FROM search_stale").pluck().get(),
    0,
  );
});

test("the first sync in a process indexes every row again", () => {
  const { db, store } = setup();
  db.prepare("DELETE FROM search_index").run();
  const fresh = createSearchIndex(db);
  fresh.sync();
  assert.deepEqual(ids(fresh.trigram("katli")), [store.items.kajuKatli.id]);
});

test("an upsert of a queued store does not fail on the queue", () => {
  const { db, store, index } = setup();
  const upsert = db.prepare(
    `INSERT INTO stores (id, seller_id, slug, name) VALUES (?, ?, 'shobhas-kitchen', ?)
    ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
  );
  upsert.run(store.storeId, store.sellerId, "Shobha Sweets");
  upsert.run(store.storeId, store.sellerId, "Shobha Sweets");
  index.sync();
  assert.equal(index.trigram(searchForm("Shobha Sweets")).length, 1);
});
