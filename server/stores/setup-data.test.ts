import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { SetupItem, SetupStoreBody } from "../../shared/setup.ts";
import { openDatabase } from "../db/database.ts";
import { seedStore } from "../test-store.ts";
import { createSetupData } from "./setup-data.ts";

const body: SetupStoreBody = {
  language: "hi",
  name: "Ghar Ki Rasoi",
  slug: "ghar-ki-rasoi",
  offers_pickup: false,
  offers_delivery: true,
  area: "HSR Layout",
  city: "Bengaluru",
  address: null,
  location: null,
};

function setup() {
  const db = openDatabase(":memory:");
  const sellerId = randomUUID();
  db.prepare(
    "INSERT INTO sellers (id, phone, language) VALUES (?, '+919845011111', 'en')",
  ).run(sellerId);
  return { db, data: createSetupData(db), sellerId };
}

function item(name: string): SetupItem {
  return {
    id: randomUUID(),
    name,
    name_latin: null,
    category: "sweets",
    veg_mark: "veg",
    box_contents: null,
    packs: [
      {
        id: randomUUID(),
        label: "6 pieces",
        grams: null,
        pieces: 6,
        price: 18_000,
      },
    ],
  };
}

test("a first save makes her store, private, and sets her language", () => {
  const { db, data, sellerId } = setup();
  const id = randomUUID();
  const saved = data.saveStore(sellerId, id, body);
  assert.ok(saved.ok);
  assert.equal(saved.store.published, false);
  assert.equal(saved.store.language, "hi");
  assert.equal(saved.store.offers_delivery, true);
  assert.equal(data.storeIdOfSeller(sellerId), id);
  assert.equal(
    db
      .prepare("SELECT language FROM sellers WHERE id = ?")
      .pluck()
      .get(sellerId),
    "hi",
  );
});

test("a save says why it cannot be done", () => {
  const { db, data, sellerId } = setup();
  const kitchen = seedStore(db);
  assert.deepEqual(data.saveStore(sellerId, kitchen.storeId, body), {
    ok: false,
    reason: "not_yours",
  });
  assert.deepEqual(
    data.saveStore(sellerId, randomUUID(), { ...body, slug: kitchen.slug }),
    { ok: false, reason: "slug_taken" },
  );
  assert.ok(data.saveStore(sellerId, randomUUID(), body).ok);
  assert.deepEqual(data.saveStore(sellerId, randomUUID(), body), {
    ok: false,
    reason: "has_store",
  });
});

test("the next free link skips the numbered links that stores have", () => {
  const { db, data } = setup();
  seedStore(db, { slug: "ghar-ki-rasoi" });
  seedStore(db, { slug: "ghar-ki-rasoi-2", phone: "+919800000002" });
  assert.deepEqual(data.checkSlug("ghar-ki-rasoi"), {
    slug: "ghar-ki-rasoi",
    available: false,
    suggestion: "ghar-ki-rasoi-3",
  });
  assert.equal(data.checkSlug("ghar-ki-rasoi-3").available, true);
});

test("a menu with an id of another store rolls back as a whole", () => {
  const { db, data, sellerId } = setup();
  const kitchen = seedStore(db);
  const id = randomUUID();
  data.saveStore(sellerId, id, body);
  const first = item("Gujiya");
  assert.equal(data.saveMenu(id, [first]), true);
  const stolenPack = {
    ...item("Laddu"),
    packs: [{ ...first.packs[0]!, id: kitchen.items.chakkuli.packs[0].id }],
  };
  assert.equal(data.saveMenu(id, [item("Mathri"), stolenPack]), false);
  const names = db
    .prepare("SELECT name FROM items WHERE store_id = ? AND in_menu = 1")
    .pluck()
    .all(id);
  assert.deepEqual(names, ["Gujiya"]);
});

test("publish needs an item with a pack, then marks the seller verified", () => {
  const { db, data, sellerId } = setup();
  const id = randomUUID();
  data.saveStore(sellerId, id, body);
  const store = data.owned(id);
  assert.ok(store);
  assert.equal(data.publish(store, 1_000), false);
  data.saveMenu(id, [item("Gujiya")]);
  assert.equal(data.publish(store, 2_000), true);
  assert.equal(data.publish(store, 3_000), true);
  assert.equal(
    db
      .prepare("SELECT verified_at FROM sellers WHERE id = ?")
      .pluck()
      .get(sellerId),
    2_000,
  );
  assert.equal(data.owned(id)?.published, true);
});
