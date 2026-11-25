import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "../../shared/day.ts";
import { errorBodySchema } from "../../shared/errors.ts";
import {
  daysResponseSchema,
  storePageSchema,
  type CartLine,
} from "../../shared/store.ts";
import type { AppDeps } from "../app.ts";
import { heroSlug, seedDemo, testSlug } from "../demo/seed.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import { createTestApp } from "../test-app.ts";
import { getMenu } from "./menu.ts";

const today = "2026-11-24";

function seededApp(overrides: Partial<AppDeps> = {}) {
  const testApp = createTestApp(overrides);
  const seed = seedDemo(testApp.deps.db, testApp.deps.clock);
  const heroId = seed.storeIds[heroSlug] ?? "";
  const pack = (name: string, label: string): string => {
    const id = getMenu(testApp.deps.db, heroId)
      .find((item) => item.name_latin === name)
      ?.packs.find((entry) => entry.label === label)?.id;
    assert.ok(id, `${name} ${label}`);
    return id;
  };
  const getStore = (slug: string) => testApp.app.request(`/api/stores/${slug}`);
  const postDays = (body: unknown) =>
    testApp.app.request("/api/days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const days = async (cart: CartLine[], storeId = heroId) => {
    const response = await postDays({ store_id: storeId, cart });
    assert.equal(response.status, 200);
    return daysResponseSchema.parse(await response.json());
  };
  return { ...testApp, seed, heroId, pack, getStore, postDays, days };
}

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

test("GET /api/stores/:slug gives the store page data of the hero store", async () => {
  const { getStore, heroId, logs } = seededApp();
  const response = await getStore(heroSlug);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const page = storePageSchema.parse(await response.json());
  assert.deepEqual(page.store, {
    id: heroId,
    slug: heroSlug,
    name: "Shobha's Kitchen",
    cover_photo: null,
    area: "Basavanagudi",
    city: "Bengaluru",
    offers_pickup: true,
    offers_delivery: true,
    accepts_online: true,
    advance_for_strangers: false,
    fssai: "00000000000000",
    is_demo: true,
    paused: false,
    normal_orders_on: true,
  });
  assert.deepEqual(page.days, {
    today,
    working_days: [0, 1, 2, 3, 4, 5, 6],
    closed_dates: [],
    last_order_day: null,
    next_free_day: today,
  });
  assert.deepEqual(page.flags, { ops_voice: true });
  assert.deepEqual(logs().at(-1)?.flags, { ops_voice: "on" });
});

test("the store page gives the stars of a rated store, and none for a store with no ratings", async () => {
  const { getStore, deps, heroId } = seededApp();
  const hero = storePageSchema.parse(await (await getStore(heroSlug)).json());
  assert.deepEqual(hero.rating, { average: 4.8, count: 312 });
  const unrated = storePageSchema.parse(
    await (await getStore(testSlug)).json(),
  );
  assert.equal(unrated.rating, null);

  deps.db
    .prepare(
      "UPDATE stores SET rating_average = 4.25, rating_count = 7 WHERE id = ?",
    )
    .run(heroId);
  const rounded = storePageSchema.parse(
    await (await getStore(heroSlug)).json(),
  );
  assert.deepEqual(rounded.rating, { average: 4.3, count: 7 });
  deps.db
    .prepare("UPDATE stores SET rating_count = 0 WHERE id = ?")
    .run(heroId);
  const noCount = storePageSchema.parse(
    await (await getStore(heroSlug)).json(),
  );
  assert.equal(noCount.rating, null);
});

test("the FSSAI number shows only when the seller gave one", async () => {
  const { getStore } = seededApp();
  const given = storePageSchema.parse(await (await getStore(heroSlug)).json());
  assert.equal(given.store.fssai, "00000000000000");
  const outside = storePageSchema.parse(
    await (await getStore(testSlug)).json(),
  );
  assert.equal(outside.store.fssai, null, "the test store gave none");
});

test("the store page lists the items by category, with the Special items first", async () => {
  const { getStore } = seededApp();
  const page = storePageSchema.parse(await (await getStore(heroSlug)).json());
  assert.deepEqual(
    page.sections.map(({ category, items }) => [
      category,
      items.map(({ name_latin }) => name_latin),
    ]),
    [
      [
        "sweets",
        [
          "Diwali assorted box",
          "Mysore pak",
          "Kaju katli",
          "Besan laddu",
          "Kobbari mithai (coconut burfi)",
        ],
      ],
      ["savouries", ["Chakkuli (chakli)", "Kodubale", "Nippattu"]],
    ],
  );
  const [box] = page.sections[0]?.items ?? [];
  assert.equal(box?.special, true);
  assert.deepEqual(box?.allergens, ["nuts", "dairy"]);
  assert.deepEqual(
    box?.packs.map(({ label, grams, price }) => [label, grams, price]),
    [
      ["500 g", 500, 45000],
      ["1 kg", 1000, 88000],
    ],
  );
});

test("the store page never holds the private address, the seller's phone or her pin", async () => {
  const { getStore } = seededApp();
  const body = await (await getStore(heroSlug)).text();
  for (const secret of ["Demo Lane", "0000000001", "12.9417", "77.5755"]) {
    assert.equal(body.includes(secret), false, secret);
  }
  for (const key of ["address", "phone", "lat", "lng", "seller_id"]) {
    assert.equal(body.includes(`"${key}"`), false, key);
  }
});

test("an unknown or unpublished store is not found", async () => {
  const { getStore, deps } = seededApp();
  const unknown = await getStore("no-such-kitchen");
  assert.equal(unknown.status, 404);
  assert.equal((await errorOf(unknown)).code, "not_found");
  deps.db
    .prepare(
      "UPDATE sellers SET verified_at = NULL WHERE id = (SELECT seller_id FROM stores WHERE slug = ?)",
    )
    .run(testSlug);
  assert.equal((await getStore(testSlug)).status, 404);
  assert.equal((await getStore("Shobhas Kitchen")).status, 404);
});

test("a paused store, or one with normal orders off, says so and has no free day", async () => {
  const { getStore, deps, heroId, days } = seededApp();
  deps.db.prepare("UPDATE stores SET paused = 1 WHERE id = ?").run(heroId);
  const paused = storePageSchema.parse(await (await getStore(heroSlug)).json());
  assert.equal(paused.store.paused, true);
  assert.equal(paused.days.next_free_day, null);
  const answer = await days([]);
  assert.equal(answer.next_free_day, null);
  assert.ok(answer.days.every(({ reason }) => reason === "not_taking_orders"));

  deps.db
    .prepare("UPDATE stores SET paused = 0, normal_orders_on = 0 WHERE id = ?")
    .run(heroId);
  const off = storePageSchema.parse(await (await getStore(heroSlug)).json());
  assert.deepEqual(
    [off.store.paused, off.store.normal_orders_on, off.days.next_free_day],
    [false, false, null],
  );
});

test("the store page shows closed dates, the last day and the flags of the page", async () => {
  const { getStore, deps, heroId } = seededApp({
    flags: createDefaultFlags({ ops_voice: false }),
  });
  deps.db
    .prepare(
      "INSERT INTO closed_dates (store_id, date) VALUES (?, ?), (?, ?), (?, ?)",
    )
    .run(heroId, "2026-11-20", heroId, today, heroId, "2026-12-31");
  deps.db
    .prepare(
      "UPDATE stores SET last_order_day = ?, working_days = ? WHERE id = ?",
    )
    .run("2026-12-10", 0b1111110, heroId);
  const response = await getStore(heroSlug);
  const page = storePageSchema.parse(await response.json());
  assert.deepEqual(page.days, {
    today,
    working_days: [1, 2, 3, 4, 5, 6],
    closed_dates: [today],
    last_order_day: "2026-12-10",
    next_free_day: "2026-11-25",
  });
  assert.deepEqual(page.flags, { ops_voice: false });
});

test("POST /api/days: on Saturday 2 kg of Mysore pak fits and 3 kg does not", async () => {
  const { days, pack, seed } = seededApp();
  const kilo = pack("Mysore pak", "1 kg");
  const two = await days([{ pack_id: kilo, quantity: 2 }]);
  const three = await days([{ pack_id: kilo, quantity: 3 }]);
  const saturdayOf = (answer: typeof two) =>
    answer.days.find(({ day }) => day === seed.saturday);
  assert.deepEqual(saturdayOf(two), {
    day: seed.saturday,
    fits: true,
    reason: null,
    space_left: 2000,
  });
  assert.deepEqual(saturdayOf(three), {
    day: seed.saturday,
    fits: false,
    reason: "not_enough_space",
    space_left: 2000,
  });
  assert.deepEqual(
    [two.today, two.limit_unit, two.cart_load, three.cart_load],
    [today, "kg", 2000, 3000],
  );
  assert.equal(two.days.length, 21);
  assert.deepEqual(
    [two.days[0]?.day, two.days.at(-1)?.day],
    [today, addDays(today, 20)],
  );
  assert.equal(three.days.find(({ day }) => day === seed.sunday)?.fits, true);
});

test("POST /api/days offers the next day with space after a full day", async () => {
  const { days, pack, deps, heroId, seed } = seededApp();
  const closed = deps.db.prepare(
    "INSERT INTO closed_dates (store_id, date) VALUES (?, ?)",
  );
  for (let day = today; day < seed.saturday; day = addDays(day, 1)) {
    closed.run(heroId, day);
  }
  const answer = await days([
    { pack_id: pack("Kaju katli", "1 kg"), quantity: 2 },
    { pack_id: pack("Chakkuli (chakli)", "500 g"), quantity: 2 },
  ]);
  assert.equal(answer.cart_load, 3000);
  assert.deepEqual(
    answer.days.slice(0, 6).map(({ day, reason }) => [day, reason]),
    [
      ["2026-11-24", "closed"],
      ["2026-11-25", "closed"],
      ["2026-11-26", "closed"],
      ["2026-11-27", "closed"],
      [seed.saturday, "not_enough_space"],
      [seed.sunday, null],
    ],
  );
  assert.equal(answer.next_free_day, seed.sunday);
});

test("POST /api/days marks a day at its limit as full, even for an empty cart", async () => {
  const { days, pack, deps, heroId, seed } = seededApp();
  const mysorePak = deps.db
    .prepare("SELECT item_id FROM packs WHERE id = ?")
    .pluck()
    .get(pack("Mysore pak", "1 kg"));
  deps.db
    .prepare(
      `INSERT INTO orders (id, store_id, number, token, source, status, fulfilment, day, total, created_at)
      VALUES ('extra-order', ?, 99, 'extra-order-token-1', 'desk', 'awaiting_payment', 'pickup', ?, 176000, 1)`,
    )
    .run(heroId, seed.saturday);
  deps.db
    .prepare(
      `INSERT INTO order_items (order_id, item_id, pack_id, quantity, price, grams)
      VALUES ('extra-order', ?, ?, 2, 88000, 1000)`,
    )
    .run(mysorePak, pack("Mysore pak", "1 kg"));
  const answer = await days([]);
  assert.deepEqual(
    answer.days.find(({ day }) => day === seed.saturday),
    { day: seed.saturday, fits: false, reason: "full", space_left: 0 },
  );
  assert.equal(answer.cart_load, 0);
  assert.equal(answer.next_free_day, today);
});

test("POST /api/days for a store with no limit fits every open day", async () => {
  const { days, deps, seed } = seededApp();
  const testId = seed.storeIds[testSlug] ?? "";
  const testKilo = getMenu(deps.db, testId)
    .find((item) => item.name_latin === "Mysore pak")
    ?.packs.find(({ label }) => label === "1 kg")?.id;
  assert.ok(testKilo);
  const answer = await days([{ pack_id: testKilo, quantity: 40 }], testId);
  assert.equal(answer.cart_load, 40_000);
  assert.ok(
    answer.days.every(({ fits, space_left }) => fits && space_left === null),
  );
});

test("POST /api/days refuses an unknown store, an invalid body and a pack from another menu", async () => {
  const { postDays, pack, heroId, seed } = seededApp();
  const kilo = pack("Mysore pak", "1 kg");

  const unknown = await postDays({
    store_id: crypto.randomUUID(),
    cart: [{ pack_id: kilo, quantity: 1 }],
  });
  assert.equal(unknown.status, 404);
  assert.equal((await errorOf(unknown)).code, "not_found");

  const invalid: unknown[] = [
    "not json",
    {},
    { store_id: heroId },
    { store_id: "shobhas-kitchen", cart: [] },
    { store_id: heroId, cart: [{ pack_id: kilo, quantity: 0 }] },
    { store_id: heroId, cart: [{ pack_id: kilo, quantity: 1.5 }] },
    { store_id: heroId, cart: [{ pack_id: "1 kg", quantity: 1 }] },
  ];
  for (const body of invalid) {
    const response = await postDays(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await errorOf(response)).code, "invalid_input");
  }

  const otherMenu = await postDays({
    store_id: seed.storeIds[testSlug],
    cart: [{ pack_id: kilo, quantity: 1 }],
  });
  assert.equal(otherMenu.status, 409);
  const error = await errorOf(otherMenu);
  assert.equal(error.code, "item_unavailable");
  assert.match(error.message, /Remove them/);
});
