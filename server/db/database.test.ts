import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  categorySchema,
  fulfilmentSchema,
  limitUnitSchema,
  orderSourceSchema,
  orderStatusSchema,
  vegMarkSchema,
} from "../../shared/model.ts";
import { appLanguageSchema } from "../../shared/languages.ts";
import { isDatabaseReady, openDatabase, type Db } from "./database.ts";

type Row = Record<string, string | number | null>;

function insert(db: Db, table: string, row: Row): void {
  const columns = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => `@${column}`).join(", ")})`,
  ).run(row);
}

function seed(): Db {
  const db = openDatabase(":memory:");
  insert(db, "sellers", {
    id: "seller",
    phone: "+919876543210",
    language: "kn",
  });
  insert(db, "stores", {
    id: "store",
    seller_id: "seller",
    slug: "shobhas-kitchen",
    name: "Shobha's Kitchen",
  });
  insert(db, "items", {
    id: "item",
    store_id: "store",
    name: "ಮೈಸೂರು ಪಾಕ್",
    category: "sweets",
    veg_mark: "veg",
    allergens: '["dairy"]',
  });
  insert(db, "packs", {
    id: "pack",
    item_id: "item",
    label: "250 g",
    grams: 250,
    price: 23000,
  });
  return db;
}

let orderCount = 0;

function order(overrides: Row = {}): Row {
  orderCount += 1;
  return {
    id: `order-${orderCount}`,
    store_id: "store",
    number: orderCount,
    token: `token-${String(orderCount).padStart(16, "0")}`,
    source: "link",
    status: "new",
    fulfilment: "pickup",
    day: "2026-11-28",
    total: 23000,
    created_at: Date.parse("2026-11-24T06:30:00Z"),
    ...overrides,
  };
}

test("an in-memory database is migrated, with foreign keys and a busy timeout", () => {
  const db = openDatabase(":memory:");
  assert.ok(Number(db.pragma("user_version", { simple: true })) >= 1);
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(db.pragma("busy_timeout", { simple: true }), 5000);
  assert.ok(isDatabaseReady(db));
});

test("a file database uses WAL and keeps its data when it opens again", () => {
  const file = join(mkdtempSync(join(tmpdir(), "db-")), "app.db");
  const db = openDatabase(file);
  assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
  insert(db, "sellers", { id: "s", phone: "+919876543210", language: "hi" });
  db.close();
  const again = openDatabase(file);
  assert.equal(again.prepare("SELECT count(*) FROM sellers").pluck().get(), 1);
  again.close();
});

test("a closed database is not ready", () => {
  const db = openDatabase(":memory:");
  db.close();
  assert.equal(isDatabaseReady(db), false);
});

const enumColumns = [
  { table: "orders", column: "status", schema: orderStatusSchema },
  { table: "orders", column: "source", schema: orderSourceSchema },
  { table: "orders", column: "fulfilment", schema: fulfilmentSchema },
  { table: "orders", column: "buyer_language", schema: appLanguageSchema },
  { table: "items", column: "veg_mark", schema: vegMarkSchema },
  { table: "items", column: "category", schema: categorySchema },
  { table: "stores", column: "limit_unit", schema: limitUnitSchema },
];

for (const { table, column, schema } of enumColumns) {
  test(`${table}.${column} takes exactly the values of the shared schema`, () => {
    const db = seed();
    const row = (value: string): Row =>
      table === "orders"
        ? order({ [column]: value })
        : table === "items"
          ? {
              id: `item-${value}`,
              store_id: "store",
              name: "Kodubale",
              category: "savouries",
              veg_mark: "veg",
              [column]: value,
            }
          : {
              id: `store-${value}`,
              seller_id: "seller",
              slug: `store-${value}`,
              name: "Store",
              [column]: value,
            };
    for (const value of schema.options) insert(db, table, row(value));
    assert.throws(() => insert(db, table, row("unknown")), /CHECK constraint/);
  });
}

test("money, days, phones, slugs and yes-or-no values are checked", () => {
  const db = seed();
  const bad: [string, Row][] = [
    ["orders", order({ total: -1 })],
    ["orders", order({ day: "2026-02-30" })],
    ["orders", order({ day: "28-11-2026" })],
    ["orders", order({ buyer_phone: "98765 43210" })],
    ["orders", order({ paid: 2 })],
    ["orders", order({ total: "₹230" })],
    ["orders", order({ token: "short" })],
    ["sellers", { id: "s2", phone: "9876543210", language: "kn" }],
    [
      "stores",
      { id: "s2", seller_id: "seller", slug: "Shobha Kitchen", name: "S" },
    ],
    [
      "stores",
      { id: "s3", seller_id: "seller", slug: "s3", name: "S", working_days: 0 },
    ],
    [
      "items",
      {
        id: "i2",
        store_id: "store",
        name: "Kodubale",
        category: "savouries",
        veg_mark: "veg",
        allergens: "wheat",
      },
    ],
    ["packs", { id: "p2", item_id: "item", label: "1 kg", price: -100 }],
  ];
  for (const [table, row] of bad) {
    assert.throws(
      () => insert(db, table, row),
      /constraint|cannot store/i,
      `${table} ${JSON.stringify(row)}`,
    );
  }
});

test("slugs and order tokens are unique, and an order number is unique in its store", () => {
  const db = seed();
  const first = order();
  insert(db, "orders", first);
  assert.throws(
    () => insert(db, "orders", order({ token: String(first.token) })),
    /UNIQUE/,
  );
  assert.throws(
    () => insert(db, "orders", order({ number: Number(first.number) })),
    /UNIQUE/,
  );
  assert.throws(
    () =>
      insert(db, "stores", {
        id: "s2",
        seller_id: "seller",
        slug: "shobhas-kitchen",
        name: "Copy",
      }),
    /UNIQUE/,
  );
});

test("foreign keys hold", () => {
  const db = seed();
  assert.throws(
    () => insert(db, "orders", order({ store_id: "missing" })),
    /FOREIGN KEY/,
  );
  insert(db, "orders", order({ id: "o1" }));
  insert(db, "order_items", {
    order_id: "o1",
    item_id: "item",
    pack_id: "pack",
    quantity: 2,
    price: 23000,
    grams: 250,
  });
  db.prepare("DELETE FROM packs WHERE id = 'pack'").run();
  assert.equal(
    db
      .prepare("SELECT pack_id FROM order_items WHERE order_id = 'o1'")
      .pluck()
      .get(),
    null,
  );
  assert.throws(
    () => db.prepare("DELETE FROM items WHERE id = 'item'").run(),
    /FOREIGN KEY/,
  );
});

test("a message belongs to an order or to a request, not both", () => {
  const db = seed();
  insert(db, "orders", order({ id: "o1" }));
  const message = {
    to_phone: "+919876543210",
    template: "order_placed",
    language: "kn",
    body: "…",
    channel: "simulated",
    created_at: 1,
  };
  insert(db, "messages", { ...message, id: "m1", order_id: "o1" });
  insert(db, "messages", { ...message, id: "m2", request_id: "r1" });
  assert.throws(
    () => insert(db, "messages", { ...message, id: "m3" }),
    /CHECK constraint/,
  );
  assert.throws(
    () =>
      insert(db, "messages", {
        ...message,
        id: "m4",
        order_id: "o1",
        request_id: "r1",
      }),
    /CHECK constraint/,
  );
});

test("orders by store and day use an index", () => {
  const db = seed();
  const plan = db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM orders WHERE store_id = ? AND day = ?",
    )
    .all("store", "2026-11-28") as { detail: string }[];
  assert.match(plan.map((step) => step.detail).join(" "), /orders_store_day/);
});
