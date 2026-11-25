import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, weekday } from "../../shared/day.ts";
import { z } from "zod";
import { openDatabase, type Db } from "../db/database.ts";
import { getMenu } from "../stores/menu.ts";
import { readCapacity } from "../stores/store-capacity.ts";
import { publishedStoreBySlug } from "../stores/store-data.ts";
import { createTestClock } from "../test-app.ts";
import {
  readDemoFixture,
  type DemoFixture,
  type DemoItem,
} from "./demo-fixture.ts";
import {
  comingSaturday,
  heroSlug,
  packsOf,
  seedDemo,
  stableId,
  testSlug,
} from "./seed.ts";

const tuesdayNoon = Date.parse("2026-11-24T06:30:00Z");

function seeded(now = tuesdayNoon) {
  const db = openDatabase(":memory:");
  const clock = createTestClock(now);
  return { db, clock, seed: seedDemo(db, clock) };
}

function count(db: Db, sql: string, ...params: unknown[]): number {
  return Number(
    db
      .prepare(sql)
      .pluck()
      .get(...params),
  );
}

function load(db: Db, slug: string, day: string) {
  const store = publishedStoreBySlug(db, slug);
  assert.ok(store, slug);
  return {
    orders: count(
      db,
      "SELECT count(*) FROM orders WHERE store_id = ? AND day = ?",
      store.id,
      day,
    ),
    load: readCapacity(db, store, day, day).loads.get(day) ?? 0,
  };
}

function insertTestOrder(db: Db, storeId: string, day: string): string {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO orders (id, store_id, number, token, source, status, fulfilment, day, total, created_at)
    VALUES (?, ?, 900, ?, 'desk', 'new', 'pickup', ?, 88000, 1)`,
  ).run(id, storeId, `token-${id}`, day);
  return id;
}

test("a fresh database gets the hero store, test-kitchen and twelve more demo stores", () => {
  const { db, seed } = seeded();
  const stores = db
    .prepare(
      "SELECT slug, is_demo, in_marketplace, daily_limit, limit_unit FROM stores ORDER BY rowid",
    )
    .all();
  assert.deepEqual(stores, [
    {
      slug: heroSlug,
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: 25000,
      limit_unit: "kg",
    },
    {
      slug: testSlug,
      is_demo: 0,
      in_marketplace: 0,
      daily_limit: null,
      limit_unit: "kg",
    },
    {
      slug: "ghar-ki-mithai",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: null,
      limit_unit: "orders",
    },
    {
      slug: "ammas-murukku-corner",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: null,
      limit_unit: "orders",
    },
    {
      slug: "andhra-ruchulu",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: 15,
      limit_unit: "orders",
    },
    {
      slug: "faral-ghar",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: 20000,
      limit_unit: "kg",
    },
    {
      slug: "coastal-kitchen",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: null,
      limit_unit: "orders",
    },
    {
      slug: "daawat-caterers",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: null,
      limit_unit: "orders",
    },
    {
      slug: "aais-dabba",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: null,
      limit_unit: "orders",
    },
    {
      slug: "bijis-rasoi",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: null,
      limit_unit: "orders",
    },
    {
      slug: "paati-samayal",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: null,
      limit_unit: "orders",
    },
    {
      slug: "ammammas-biryani",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: 15000,
      limit_unit: "kg",
    },
    {
      slug: "puneri-misal-house",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: 20,
      limit_unit: "orders",
    },
    {
      slug: "mashis-rannaghar",
      is_demo: 1,
      in_marketplace: 1,
      daily_limit: 25,
      limit_unit: "orders",
    },
  ]);
  assert.deepEqual(seed, {
    day: "2026-11-24",
    saturday: "2026-11-28",
    sunday: "2026-11-29",
    storeIds: Object.fromEntries(
      stores.map((store) => {
        const { slug } = store as { slug: string };
        return [slug, stableId("store", slug)];
      }),
    ),
  });
  assert.deepEqual(
    db
      .prepare(
        "SELECT slug, working_days FROM stores WHERE working_days <> 127 ORDER BY rowid",
      )
      .all(),
    [
      { slug: "paati-samayal", working_days: 0b1111011 },
      { slug: "puneri-misal-house", working_days: 0b1111101 },
      { slug: "mashis-rannaghar", working_days: 0b1101111 },
    ],
  );
  assert.equal(
    count(db, "SELECT count(*) FROM sellers WHERE verified_at IS NULL"),
    0,
  );
});

test("the coming Saturday has 12 orders with 23 kg, and Sunday 5 orders with 9 kg", () => {
  const { db, seed } = seeded();
  assert.deepEqual(load(db, heroSlug, seed.saturday), {
    orders: 12,
    load: 23_000,
  });
  assert.deepEqual(load(db, heroSlug, seed.sunday), { orders: 5, load: 9_000 });
  assert.equal(
    count(
      db,
      "SELECT count(*) FROM orders WHERE day NOT IN (?, ?) AND day >= ?",
      seed.saturday,
      seed.sunday,
      seed.day,
    ),
    0,
  );
  const totals = db
    .prepare(
      `SELECT orders.total, sum(order_items.quantity * order_items.price) AS lines
      FROM orders JOIN order_items ON order_items.order_id = orders.id GROUP BY orders.id`,
    )
    .all() as { total: number; lines: number }[];
  assert.equal(totals.length, 20);
  for (const { total, lines } of totals) assert.equal(total, lines);
});

test("the hero store has 3 finished, paid orders in its last 30 days, before today", () => {
  const { db, seed } = seeded();
  const past = db
    .prepare(
      `SELECT day, status, paid, created_at FROM orders
      WHERE store_id = ? AND day < ? ORDER BY day`,
    )
    .all(seed.storeIds[heroSlug], seed.day) as {
    day: string;
    status: string;
    paid: number;
    created_at: number;
  }[];
  assert.deepEqual(
    past.map(({ day, status, paid }) => [day, status, paid]),
    [
      [addDays(seed.day, -16), "picked_up", 1],
      [addDays(seed.day, -9), "picked_up", 1],
      [addDays(seed.day, -3), "delivered", 1],
    ],
  );
  for (const order of past) {
    assert.ok(order.created_at < Date.parse(`${order.day}T00:00:00+05:30`));
  }
  assert.equal(
    count(db, "SELECT count(*) FROM orders WHERE day < ?", seed.day),
    3,
  );
});

test("test-kitchen has the hero menu, with its own ids, and no orders", () => {
  const { db, seed } = seeded();
  const hero = getMenu(db, seed.storeIds[heroSlug] ?? "");
  const testMenu = getMenu(db, seed.storeIds[testSlug] ?? "");
  const shape = (menu: typeof hero) =>
    menu.map(({ id: _, packs, ...item }) => ({
      ...item,
      packs: packs.map(({ id: _id, ...pack }) => pack),
    }));
  assert.equal(hero.length, 8);
  assert.deepEqual(shape(testMenu), shape(hero));
  assert.notEqual(testMenu[0]?.id, hero[0]?.id);
  assert.equal(
    count(
      db,
      "SELECT count(*) FROM orders WHERE store_id = ?",
      seed.storeIds[testSlug],
    ),
    0,
  );
});

test("the other demo stores get packs by the rule of demo-data.md", () => {
  const { db, seed } = seeded();
  const packs = (slug: string, name: string) =>
    getMenu(db, seed.storeIds[slug] ?? "")
      .find((item) => item.name === name)
      ?.packs.map(({ label, grams, pieces, price }) => [
        label,
        grams,
        pieces,
        price,
      ]);
  assert.deepEqual(packs("ghar-ki-mithai", "Kaju katli"), [
    ["250 g", 250, null, 32500],
    ["500 g", 500, null, 65000],
    ["1 kg", 1000, null, 130000],
  ]);
  assert.deepEqual(packs("ghar-ki-mithai", "Gujiya"), [
    ["1 piece", null, 1, 3000],
    ["6 pieces", null, 6, 18000],
    ["12 pieces", null, 12, 36000],
  ]);
  assert.deepEqual(packs("faral-ghar", "Karanji"), [
    ["1 piece", 40, 1, 2500],
    ["6 pieces", 240, 6, 15000],
    ["12 pieces", 480, 12, 30000],
  ]);
  assert.deepEqual(packs("coastal-kitchen", "Plum cake"), [
    ["500 g", 500, null, 45000],
    ["1 kg", 1000, null, 88000],
  ]);
  assert.deepEqual(packs("ammammas-biryani", "హైదరాబాదీ చికెన్ దమ్ బిర్యానీ"), [
    ["250 g", 250, null, 16500],
    ["500 g", 500, null, 32500],
    ["1 kg", 1000, null, 65000],
  ]);
  assert.deepEqual(packs("ammammas-biryani", "మిర్చి బజ్జీ"), [
    ["1 piece", 50, 1, 1500],
    ["6 pieces", 300, 6, 9000],
    ["12 pieces", 600, 12, 18000],
  ]);
  assert.deepEqual(packs("paati-samayal", "சைவ சாப்பாடு"), [
    ["1 plate", null, null, 15000],
  ]);
  const bulkOnly = db
    .prepare(
      "SELECT in_menu, in_bulk, bulk_min_qty, bulk_unit, bulk_price FROM items WHERE name = ?",
    )
    .get("Assorted gift box (250 g)");
  assert.deepEqual(bulkOnly, {
    in_menu: 0,
    in_bulk: 1,
    bulk_min_qty: 100,
    bulk_unit: "pieces",
    bulk_price: null,
  });
});

test("the phones of sellers and seed buyers are in the fictional range +91 00000", () => {
  const { db } = seeded();
  const phones = db
    .prepare(
      "SELECT phone FROM sellers UNION ALL SELECT buyer_phone FROM orders",
    )
    .pluck()
    .all() as string[];
  assert.equal(phones.length, 14 + 20);
  for (const phone of phones) assert.match(phone, /^\+9100000\d{5}$/);
});

test("the refresh resets the demo stores and keeps the orders of test-kitchen", () => {
  const { db, clock, seed } = seeded();
  const heroId = seed.storeIds[heroSlug] ?? "";
  const testId = seed.storeIds[testSlug] ?? "";
  const heroPacks = getMenu(db, heroId).flatMap(({ packs }) =>
    packs.map(({ id }) => id),
  );
  const experimentOrder = insertTestOrder(db, testId, seed.saturday);
  insertTestOrder(db, heroId, seed.saturday);
  db.prepare(
    "UPDATE stores SET paused = 1, daily_limit = 1000 WHERE id IN (?, ?)",
  ).run(heroId, testId);
  db.prepare("UPDATE items SET sold_out = 1 WHERE store_id IN (?, ?)").run(
    heroId,
    testId,
  );
  db.prepare(
    "INSERT INTO closed_dates (store_id, date) VALUES (?, ?), (?, ?)",
  ).run(heroId, seed.sunday, testId, seed.sunday);

  clock.advance(24 * 60 * 60 * 1000);
  const again = seedDemo(db, clock);

  assert.deepEqual(again.storeIds, seed.storeIds);
  assert.equal(again.day, "2026-11-25");
  assert.deepEqual(load(db, heroSlug, seed.saturday), {
    orders: 12,
    load: 23_000,
  });
  assert.equal(
    count(db, "SELECT count(*) FROM orders WHERE store_id = ?", heroId),
    20,
  );
  assert.deepEqual(
    db
      .prepare("SELECT paused, daily_limit FROM stores WHERE id = ?")
      .get(heroId),
    { paused: 0, daily_limit: 25000 },
  );
  assert.equal(
    count(
      db,
      "SELECT count(*) FROM items WHERE store_id = ? AND sold_out = 1",
      heroId,
    ),
    0,
  );
  assert.equal(
    count(db, "SELECT count(*) FROM closed_dates WHERE store_id = ?", heroId),
    0,
  );
  assert.deepEqual(
    getMenu(db, heroId).flatMap(({ packs }) => packs.map(({ id }) => id)),
    heroPacks,
  );

  assert.deepEqual(
    db.prepare("SELECT id FROM orders WHERE store_id = ?").pluck().all(testId),
    [experimentOrder],
  );
  assert.deepEqual(
    db
      .prepare("SELECT paused, daily_limit FROM stores WHERE id = ?")
      .get(testId),
    { paused: 1, daily_limit: 1000 },
  );
  assert.equal(
    count(
      db,
      "SELECT count(*) FROM items WHERE store_id = ? AND sold_out = 1",
      testId,
    ),
    8,
  );
  assert.equal(
    count(db, "SELECT count(*) FROM closed_dates WHERE store_id = ?", testId),
    1,
  );
});

test("demo stores get made-up ratings, which the refresh restores; test-kitchen and the caterer have none", () => {
  const { db, clock, seed } = seeded();
  const ratings = () =>
    db
      .prepare(
        "SELECT slug, rating_average, rating_count FROM stores ORDER BY rowid",
      )
      .all() as {
      slug: string;
      rating_average: number | null;
      rating_count: number;
    }[];
  const first = ratings();
  const unrated = first.filter((store) => store.rating_average === null);
  assert.deepEqual(
    unrated.map(({ slug, rating_count }) => ({ slug, rating_count })),
    [
      { slug: testSlug, rating_count: 0 },
      { slug: "daawat-caterers", rating_count: 0 },
    ],
  );
  const rated = first.filter((store) => store.rating_average !== null);
  for (const { slug, rating_average, rating_count } of rated) {
    assert.ok(
      (rating_average ?? 0) >= 3.9 && (rating_average ?? 0) <= 4.8,
      slug,
    );
    assert.ok(rating_count >= 20 && rating_count <= 400, slug);
  }
  const hero = rated.find(({ slug }) => slug === heroSlug);
  assert.equal(
    hero?.rating_average,
    Math.max(...rated.map(({ rating_average }) => rating_average ?? 0)),
  );

  db.prepare(
    "UPDATE stores SET rating_average = 1, rating_count = 1 WHERE id = ?",
  ).run(seed.storeIds[heroSlug] ?? "");
  clock.advance(24 * 60 * 60 * 1000);
  seedDemo(db, clock);
  assert.deepEqual(ratings(), first);
});

test("each demo store in the marketplace has an FSSAI number, and the test store, out of it, has none", () => {
  const { db } = seeded();
  const stores = db
    .prepare("SELECT slug, in_marketplace, fssai FROM stores ORDER BY rowid")
    .all() as { slug: string; in_marketplace: number; fssai: string | null }[];
  for (const { slug, in_marketplace, fssai } of stores) {
    assert.equal(fssai !== null, in_marketplace === 1, slug);
  }
  assert.equal(stores.find(({ slug }) => slug === "test-kitchen")?.fssai, null);
});

test("the seed days move with the seed day", () => {
  const saturdayNoon = Date.parse("2026-11-28T06:30:00Z");
  const { db, seed } = seeded(saturdayNoon);
  assert.deepEqual(
    [seed.day, seed.saturday, seed.sunday],
    ["2026-11-28", "2026-12-05", "2026-12-06"],
  );
  assert.deepEqual(load(db, heroSlug, "2026-12-05"), {
    orders: 12,
    load: 23_000,
  });
  assert.equal(load(db, heroSlug, "2026-11-28").orders, 0);
});

test("comingSaturday is the next Saturday after the day", () => {
  const days = Array.from({ length: 7 }, (_, offset) =>
    addDays("2026-11-22", offset),
  );
  assert.deepEqual(
    days.map((day) => [day, comingSaturday(day)]),
    [
      ["2026-11-22", "2026-11-28"],
      ["2026-11-23", "2026-11-28"],
      ["2026-11-24", "2026-11-28"],
      ["2026-11-25", "2026-11-28"],
      ["2026-11-26", "2026-11-28"],
      ["2026-11-27", "2026-11-28"],
      ["2026-11-28", "2026-12-05"],
    ],
  );
  for (const day of days) assert.equal(weekday(comingSaturday(day)), 6);
});

test("stableId gives the same UUID for the same parts, and a new one otherwise", () => {
  const id = stableId("store", heroSlug);
  assert.equal(z.uuid().safeParse(id).success, true);
  assert.equal(stableId("store", heroSlug), id);
  assert.notEqual(stableId("store", testSlug), id);
  assert.notEqual(stableId("item", "ab", "c"), stableId("item", "a", "bc"));
});

test("packsOf follows the fixture: its own packs, a price per kg or a price per piece", () => {
  const base: DemoItem = {
    key: "x",
    name: "X",
    name_latin: "X",
    category: "sweets",
    veg_mark: "veg",
    allergens: [],
    special: false,
    in_menu: true,
  };
  assert.deepEqual(
    packsOf({ ...base, packs: [{ label: "Box", pieces: 1, price: 50000 }] }),
    [{ label: "Box", grams: null, pieces: 1, price: 50000 }],
  );
  assert.equal(packsOf({ ...base, price_per_kg: 45000 })[0]?.price, 11500);
  assert.equal(packsOf({ ...base, price_per_piece: 2500 })[2]?.price, 30000);
  assert.deepEqual(packsOf({ ...base, in_menu: false }), []);
});

test("a fixture order that names a missing pack stops the seed and changes nothing", () => {
  const fixture: DemoFixture = structuredClone(readDemoFixture());
  const hero = fixture.stores[0];
  assert.ok(hero?.orders[0]?.lines[0]);
  hero.orders[0].lines[0].pack = "2 kg";
  const db = openDatabase(":memory:");
  assert.throws(
    () => seedDemo(db, createTestClock(), fixture),
    /order 1 of shobhas-kitchen names the pack "2 kg" of "mysore-pak"/,
  );
  assert.equal(count(db, "SELECT count(*) FROM stores"), 0);
});
