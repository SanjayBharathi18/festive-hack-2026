import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase, type Db } from "../db/database.ts";
import {
  publishedStoreById,
  publishedStoreBySlug,
  type Store,
} from "./store-data.ts";

const yesNoColumns = [
  "offers_pickup",
  "offers_delivery",
  "accepts_online",
  "advance_for_strangers",
  "in_marketplace",
  "normal_orders_on",
  "bulk_on",
  "catering_on",
  "paused",
  "slug_changed",
  "is_demo",
] as const;

function storeDb(): Db {
  const db = openDatabase(":memory:");
  db.prepare(
    "INSERT INTO sellers (id, phone, language, verified_at) VALUES ('verified', '+910000000001', 'kn', 1), ('new', '+910000000002', 'hi', NULL)",
  ).run();
  const insert = db.prepare(
    `INSERT INTO stores (id, seller_id, slug, name, address, lat, lng, fssai,
      limit_unit, daily_limit, last_order_day, working_days,
      ${yesNoColumns.join(", ")})
    VALUES (@id, @seller_id, @slug, 'Store', @address, 12.9417, 77.5755, NULL,
      'kg', 25000, '2026-12-10', 62,
      ${yesNoColumns.map(() => "@yes").join(", ")})`,
  );
  insert.run({
    id: "all-yes",
    seller_id: "verified",
    slug: "all-yes",
    address: "No. 1, Demo Lane",
    yes: 1,
  });
  insert.run({
    id: "all-no",
    seller_id: "verified",
    slug: "all-no",
    address: null,
    yes: 0,
  });
  insert.run({
    id: "unpublished",
    seller_id: "new",
    slug: "unpublished",
    address: null,
    yes: 1,
  });
  return db;
}

test("a store row turns each yes-or-no column into a boolean", () => {
  const db = storeDb();
  const yes = publishedStoreBySlug(db, "all-yes");
  const no = publishedStoreBySlug(db, "all-no");
  assert.ok(yes && no);
  for (const column of yesNoColumns) {
    assert.equal(yes[column], true, column);
    assert.equal(no[column], false, column);
  }
});

test("a store row keeps its other values as they are", () => {
  const store = publishedStoreBySlug(storeDb(), "all-yes");
  const expected: Partial<Store> = {
    id: "all-yes",
    seller_id: "verified",
    slug: "all-yes",
    name: "Store",
    cover_photo: null,
    address: "No. 1, Demo Lane",
    lat: 12.9417,
    lng: 77.5755,
    fssai: null,
    limit_unit: "kg",
    daily_limit: 25000,
    last_order_day: "2026-12-10",
    working_days: 62,
  };
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(store?.[key as keyof Store], value, key);
  }
});

test("a store is found by its slug or its id once its seller is verified", () => {
  const db = storeDb();
  assert.deepEqual(
    publishedStoreById(db, "all-no"),
    publishedStoreBySlug(db, "all-no"),
  );
  assert.equal(publishedStoreBySlug(db, "unpublished"), undefined);
  assert.equal(publishedStoreById(db, "unpublished"), undefined);
  assert.equal(publishedStoreBySlug(db, "no-such-store"), undefined);
  assert.equal(publishedStoreById(db, "no-such-store"), undefined);
  assert.equal(publishedStoreBySlug(db, "all-no' OR '1'='1"), undefined);
});
