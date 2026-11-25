import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../db/database.ts";
import { seedStore } from "../test-store.ts";
import { createCatalog, type CatalogRequest } from "./catalog.ts";

const request: CatalogRequest = {
  words: { match: "all" },
  needBy: null,
  veg: null,
  category: null,
  sort: "rating",
  origin: null,
  city: null,
  today: "2026-11-24",
};

function setup() {
  const db = openDatabase(":memory:");
  const store = seedStore(db);
  db.prepare("UPDATE stores SET fssai = '10012345678901'").run();
  return { db, store, catalog: createCatalog(db) };
}

test("a cook's dishes show those she still has first, her special ones first among them", () => {
  const { db, store, catalog } = setup();
  db.prepare("UPDATE items SET sold_out = 1 WHERE id = ?").run(
    store.items.mysorePak.id,
  );
  db.prepare("UPDATE items SET special = 1 WHERE id = ?").run(
    store.items.kajuKatli.id,
  );
  const [found] = catalog.search(request).stores;
  assert.deepEqual(
    found?.dishes.map(({ id }) => id),
    [
      store.items.kajuKatli.id,
      store.items.chakkuli.id,
      store.items.mysorePak.id,
    ],
  );
  assert.equal(found?.more_dishes, 0);
});

test("three dishes show, and the card counts the others", () => {
  const { db, store, catalog } = setup();
  const insert = db.prepare(
    "INSERT INTO items (id, store_id, name, category, veg_mark) VALUES (?, ?, ?, 'sweets', 'veg')",
  );
  insert.run(
    "5b9e92c4-0738-4ba2-8e3c-2044285ef988",
    store.storeId,
    "Rava laddu",
  );
  insert.run(
    "6c0fa3d5-1849-4cb3-9f4d-3155396f0a99",
    store.storeId,
    "Gulab jamun",
  );
  const [found] = catalog.search(request).stores;
  assert.equal(found?.dishes.length, 3);
  assert.equal(found?.more_dishes, 2);
  assert.equal(
    found?.dishes.find(({ name }) => name === "Rava laddu"),
    undefined,
  );
});

test("a city keeps only its cooks, by any of its names in any case", () => {
  const { catalog } = setup();
  for (const city of ["bengaluru", "Bangalore", "ಬೆಂಗಳೂರು", "बेंगलुरु"]) {
    assert.equal(catalog.search({ ...request, city }).stores.length, 1, city);
  }
  assert.equal(catalog.search({ ...request, city: "Mysuru" }).stores.length, 0);
});

test("the distances start at the origin of the request: a buyer's place or a city centre", () => {
  const { catalog } = setup();
  const centre = { lat: 12.9716, lng: 77.5946 };
  const [store] = catalog.search({
    ...request,
    sort: "distance",
    origin: centre,
  }).stores;
  assert.equal(store?.distance_km, 4);
  assert.equal(catalog.search(request).stores[0]?.distance_km, null);
});

test("a matching dish comes first, then her other dishes that pass the filters", () => {
  const { db, store, catalog } = setup();
  const hit = {
    kind: "item",
    id: store.items.chakkuli.id,
    store_id: store.storeId,
  } as const;
  const [found] = catalog.search({
    ...request,
    words: { match: "trigram", hits: [hit] },
  }).stores;
  assert.equal(found?.dishes[0]?.id, store.items.chakkuli.id);
  assert.equal(found?.dishes.length, 3);
  db.prepare("UPDATE items SET veg_mark = 'egg' WHERE id = ?").run(
    store.items.kajuKatli.id,
  );
  const [veg] = catalog.search({ ...request, veg: "veg" }).stores;
  assert.deepEqual(
    veg?.dishes.map(({ id }) => id).sort(),
    [store.items.mysorePak.id, store.items.chakkuli.id].sort(),
  );
});

test("each dish shows her cheapest pack, and the shop shows its two main categories", () => {
  const { db, store, catalog } = setup();
  const [found] = catalog.search(request).stores;
  const mysorePak = found?.dishes.find(
    ({ id }) => id === store.items.mysorePak.id,
  );
  const cheapest = store.items.mysorePak.packs[0];
  assert.deepEqual(mysorePak?.pack, {
    label: cheapest.label,
    grams: cheapest.grams,
    pieces: null,
    price: cheapest.price,
  });
  assert.deepEqual(found?.categories, ["sweets", "savouries"]);
  db.prepare("DELETE FROM packs WHERE item_id = ?").run(
    store.items.mysorePak.id,
  );
  const [none] = catalog.search(request).stores;
  assert.equal(
    none?.dishes.find(({ id }) => id === store.items.mysorePak.id)?.pack,
    null,
  );
});

test("a store shows her rating to one decimal, and none while she has no rating", () => {
  const { db, catalog } = setup();
  assert.equal(catalog.search(request).stores[0]?.rating, null);
  db.prepare(
    "UPDATE stores SET rating_average = 4.567, rating_count = 128",
  ).run();
  assert.deepEqual(catalog.search(request).stores[0]?.rating, {
    average: 4.6,
    count: 128,
  });
  db.prepare("UPDATE stores SET rating_count = 0").run();
  assert.equal(catalog.search(request).stores[0]?.rating, null);
});

test("a store without her FSSAI number is not in the results", () => {
  const { db, catalog } = setup();
  db.prepare("UPDATE stores SET fssai = NULL").run();
  assert.deepEqual(catalog.search(request).stores, []);
});
