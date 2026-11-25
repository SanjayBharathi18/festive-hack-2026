import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "../../shared/day.ts";
import { packagesOf } from "../catering/package-data.ts";
import { openDatabase, type Db } from "../db/database.ts";
import { createTestClock } from "../test-app.ts";
import { readDemoFixture } from "./demo-fixture.ts";
import {
  clearDemoRequests,
  demoBoardToken,
  seedBoardPosts,
  seedCatering,
} from "./seed-bulk-catering.ts";
import { seedDemo, stableId } from "./seed.ts";

const daawat = "daawat-caterers";

function seeded() {
  const db = openDatabase(":memory:");
  const clock = createTestClock();
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

test("Daawat Caterers takes only catering, with three packages and the coming Sunday booked", () => {
  const { db, seed } = seeded();
  const storeId = seed.storeIds[daawat] ?? "";
  assert.deepEqual(
    db
      .prepare(
        "SELECT catering_on, normal_orders_on, bulk_on FROM stores WHERE id = ?",
      )
      .get(storeId),
    { catering_on: 1, normal_orders_on: 0, bulk_on: 0 },
  );
  const packages = packagesOf(db, storeId);
  assert.deepEqual(
    packages.map(({ id, name, price, min_count, max_total }) => [
      id,
      name,
      price,
      min_count,
      max_total,
    ]),
    [
      [
        stableId("package", daawat, "silver-plate"),
        "Silver plate",
        35_000,
        100,
        9,
      ],
      [
        stableId("package", daawat, "gold-plate"),
        "Gold plate",
        50_000,
        100,
        13,
      ],
      [stableId("package", daawat, "buffet"), "Buffet", null, 150, null],
    ],
  );
  assert.deepEqual(
    packages[0]?.categories.map(({ name, min, max, dishes }) => [
      name,
      min,
      max,
      dishes.length,
    ]),
    [
      ["Sweets", 1, 2, 4],
      ["Starters", 0, 2, 3],
      ["Mains", 2, 3, 4],
      ["Breads", 1, 1, 3],
      ["Rice", 1, 2, 3],
    ],
  );
  assert.equal(packages[2]?.free_choice, true);
  assert.deepEqual(
    db
      .prepare("SELECT date FROM closed_dates WHERE store_id = ?")
      .pluck()
      .all(storeId),
    [seed.sunday],
  );
  assert.equal(
    count(db, "SELECT count(*) FROM items WHERE store_id = ?", storeId),
    0,
  );
});

test("the demo board post is open for 10 days, with the answer of Ghar Ki Mithai", () => {
  const { db, seed } = seeded();
  const row = db
    .prepare("SELECT * FROM board_posts WHERE id = ?")
    .get(stableId("board-post", "whitefield-diwali")) as Record<
    string,
    unknown
  >;
  assert.equal(row.token, demoBoardToken("whitefield-diwali"));
  assert.equal(row.company_name, null);
  assert.equal(row.description, "A tech company in Whitefield");
  assert.equal(row.need_by, addDays(seed.day, 10));
  assert.equal(row.status, "open");
  assert.equal(row.is_demo, 1);
  assert.equal(row.budget_per_unit, 25_000);
  assert.deepEqual(JSON.parse(String(row.places)), [
    "Whitefield office",
    "Bellandur office",
  ]);
  assert.deepEqual(
    db
      .prepare(
        "SELECT store_id, note FROM board_interests WHERE board_post_id = ?",
      )
      .all(row.id),
    [
      {
        store_id: seed.storeIds["ghar-ki-mithai"],
        note: "We can do both. Samples on WhatsApp.",
      },
    ],
  );
});

test("a refresh restores the packages, the booked date and the board post, and clears requests", () => {
  const { db, clock, seed } = seeded();
  const fixture = readDemoFixture();
  const storeId = seed.storeIds[daawat] ?? "";
  const gharId = seed.storeIds["ghar-ki-mithai"] ?? "";
  const postId = stableId("board-post", "whitefield-diwali");
  db.prepare("DELETE FROM packages WHERE store_id = ? AND name = 'Buffet'").run(
    storeId,
  );
  db.prepare(
    "UPDATE package_categories SET max = 4 WHERE name = 'Sweets'",
  ).run();
  db.prepare(
    `INSERT INTO quote_requests (id, store_id, kind, payload, buyer_name,
      buyer_phone, language, created_at)
    VALUES (?, ?, 'catering', '{}', 'Visitor', '+919876500001', 'en', 1)`,
  ).run(crypto.randomUUID(), storeId);
  db.prepare("UPDATE board_posts SET status = 'closed' WHERE id = ?").run(
    postId,
  );
  db.prepare("DELETE FROM board_interests").run();
  db.prepare("DELETE FROM closed_dates WHERE store_id = ?").run(storeId);

  clock.advance(24 * 60 * 60 * 1000);
  const day = addDays(seed.day, 1);
  db.transaction(() => {
    for (const store of fixture.stores.filter(({ is_demo }) => is_demo)) {
      const id = seed.storeIds[store.slug] ?? "";
      clearDemoRequests(db, id);
      seedCatering(db, {
        store,
        storeId: id,
        days: { saturday: seed.saturday, sunday: seed.sunday },
        stableId,
      });
    }
    seedBoardPosts(db, fixture.board_posts, {
      day,
      now: clock.now(),
      storeIds: seed.storeIds,
      stableId,
    });
  })();

  const packages = packagesOf(db, storeId);
  assert.deepEqual(
    packages.map(({ name }) => name),
    ["Silver plate", "Gold plate", "Buffet"],
  );
  assert.equal(packages[0]?.categories[0]?.max, 2);
  assert.equal(count(db, "SELECT count(*) FROM quote_requests"), 0);
  assert.equal(
    count(db, "SELECT count(*) FROM closed_dates WHERE store_id = ?", storeId),
    1,
  );
  assert.deepEqual(
    db
      .prepare("SELECT status, need_by FROM board_posts WHERE id = ?")
      .get(postId),
    { status: "open", need_by: addDays(day, 10) },
  );
  assert.equal(
    count(
      db,
      "SELECT count(*) FROM board_interests WHERE board_post_id = ? AND store_id = ?",
      postId,
      gharId,
    ),
    1,
  );
});

test("the demo board token is stable and long enough for a link", () => {
  assert.equal(demoBoardToken("a"), demoBoardToken("a"));
  assert.notEqual(demoBoardToken("a"), demoBoardToken("b"));
  assert.match(demoBoardToken("a"), /^demo-[\w-]{22}$/);
});

test("the hero store has a bulk section with the Diwali box and two seed quote requests", () => {
  const { db, clock, seed } = seeded();
  const heroId = seed.storeIds["shobhas-kitchen"] ?? "";
  assert.deepEqual(
    db
      .prepare("SELECT bulk_on, bulk_line FROM stores WHERE id = ?")
      .get(heroId),
    { bulk_on: 1, bulk_line: "Diwali gift boxes for offices and families" },
  );
  assert.deepEqual(
    db
      .prepare(
        "SELECT name_latin, bulk_min_qty, bulk_unit, bulk_price FROM items WHERE store_id = ? AND in_bulk = 1",
      )
      .all(heroId),
    [
      {
        name_latin: "Diwali assorted box",
        bulk_min_qty: 25,
        bulk_unit: "pieces",
        bulk_price: 42_000,
      },
    ],
  );
  const quotes = () =>
    db
      .prepare(
        "SELECT id, buyer_phone, language, payload FROM quote_requests WHERE store_id = ? ORDER BY created_at",
      )
      .all(heroId) as {
      id: string;
      buyer_phone: string;
      language: string;
      payload: string;
    }[];
  const first = quotes();
  assert.deepEqual(
    first.map(({ id, language }) => [id, language]),
    [
      [stableId("quote", "shobhas-kitchen", "office-gifts"), "hi"],
      [stableId("quote", "shobhas-kitchen", "family-boxes"), "kn"],
    ],
  );
  for (const { buyer_phone } of first)
    assert.match(buyer_phone, /^\+9100000\d{5}$/);
  const payload = JSON.parse(first[0]?.payload ?? "{}") as Record<
    string,
    unknown
  >;
  assert.equal(payload.need_by, addDays(seed.day, 6));
  assert.equal(payload.estimate, 60 * 42_000);
  assert.equal(payload.note, "हर डिब्बे पर हमारी कंपनी का नाम चाहिए।");

  db.prepare(
    `INSERT INTO quote_requests (id, store_id, kind, payload, buyer_name,
      buyer_phone, language, created_at)
    VALUES (?, ?, 'bulk', '{}', 'Visitor', '+919876500001', 'en', 1)`,
  ).run(crypto.randomUUID(), heroId);
  clock.advance(24 * 60 * 60 * 1000);
  const again = seedDemo(db, clock);
  assert.equal(quotes().length, 2, "a refresh leaves only the seed quotes");
  assert.equal(
    (JSON.parse(quotes()[0]?.payload ?? "{}") as { need_by: string }).need_by,
    addDays(again.day, 6),
  );
});
