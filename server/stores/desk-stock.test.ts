import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { addDays } from "../../shared/day.ts";
import {
  closeAheadDays,
  closedDayAnswerSchema,
  deskStoreSchema,
  pausedSchema,
  soldOutAnswerSchema,
} from "../../shared/desk.ts";
import { errorBodySchema } from "../../shared/errors.ts";
import { daysResponseSchema, storePageSchema } from "../../shared/store.ts";
import { orderApp, saturday, sunday, today } from "../orders/test-orders.ts";
import { seedStore } from "../test-store.ts";
import { postJson } from "../verify/test-sign-in.ts";

type Shop = ReturnType<typeof orderApp>;

const put = (shop: Shop, path: string, body: unknown) =>
  shop.desk(path, { method: "PUT", body: JSON.stringify(body) });

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

async function deskStore(shop: Shop) {
  return deskStoreSchema.parse(
    await (await shop.desk("/api/desk/store")).json(),
  );
}

async function storePage(shop: Shop) {
  const response = await shop.app.request("/api/stores/shobhas-kitchen");
  assert.equal(response.status, 200);
  return storePageSchema.parse(await response.json());
}

test("each stock route needs the seller session or the demo token", async () => {
  const shop = orderApp();
  for (const path of [
    `/api/desk/items/${shop.store.items.chakkuli.id}/sold-out`,
    "/api/desk/paused",
    `/api/desk/closed-dates/${saturday}`,
  ]) {
    const response = await shop.app.request(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sold_out: true, paused: true, closed: true }),
    });
    assert.equal(response.status, 401, path);
    assert.equal((await errorOf(response)).code, "not_signed_in");
  }
});

test("one touch sells an item out, and one more makes it available again", async () => {
  const shop = orderApp();
  const { chakkuli } = shop.store.items;
  const path = `/api/desk/items/${chakkuli.id}/sold-out`;

  const response = await put(shop, path, { sold_out: true });
  assert.equal(response.status, 200);
  assert.deepEqual(soldOutAnswerSchema.parse(await response.json()), {
    item_id: chakkuli.id,
    sold_out: true,
  });
  const soldOut = (await deskStore(shop)).menu.find(
    (item) => item.id === chakkuli.id,
  );
  assert.equal(soldOut?.sold_out, true);
  const buyerItem = (await storePage(shop)).sections
    .flatMap((section) => section.items)
    .find((item) => item.id === chakkuli.id);
  assert.equal(buyerItem?.sold_out, true);
  const { response: refused } = await shop.checkout({
    cart: [
      {
        pack_id: chakkuli.packs[2].id,
        quantity: 1,
        price: chakkuli.packs[2].price,
      },
    ],
  });
  assert.equal(refused.status, 409);
  assert.equal((await errorOf(refused)).code, "item_sold_out");

  const again = await put(shop, path, { sold_out: true });
  assert.equal(again.status, 200);
  const back = await put(shop, path, { sold_out: false });
  assert.deepEqual(soldOutAnswerSchema.parse(await back.json()), {
    item_id: chakkuli.id,
    sold_out: false,
  });
  const available = (await deskStore(shop)).menu.find(
    (item) => item.id === chakkuli.id,
  );
  assert.equal(available?.sold_out, false);
});

test("she can sell out only the items of her own store", async () => {
  const shop = orderApp();
  const other = seedStore(shop.deps.db, {
    slug: "test-kitchen",
    phone: "+919800000002",
  });
  for (const id of [other.items.chakkuli.id, randomUUID()]) {
    const response = await put(shop, `/api/desk/items/${id}/sold-out`, {
      sold_out: true,
    });
    assert.equal(response.status, 404);
    assert.equal((await errorOf(response)).code, "not_found");
  }
  const sold = shop.deps.db
    .prepare("SELECT sold_out FROM items WHERE id = ?")
    .pluck()
    .get(other.items.chakkuli.id);
  assert.equal(sold, 0);
});

test("a sold-out change needs its state", async () => {
  const shop = orderApp();
  const response = await put(
    shop,
    `/api/desk/items/${shop.store.items.chakkuli.id}/sold-out`,
    { sold_out: "yes" },
  );
  assert.equal(response.status, 400);
  assert.equal((await errorOf(response)).code, "invalid_input");
});

test("a pause stops new orders, and the store stays visible", async () => {
  const shop = orderApp();
  const response = await put(shop, "/api/desk/paused", { paused: true });
  assert.equal(response.status, 200);
  assert.deepEqual(pausedSchema.parse(await response.json()), { paused: true });
  assert.equal((await deskStore(shop)).store.paused, true);

  const page = await storePage(shop);
  assert.equal(page.store.paused, true);
  assert.ok(page.sections.length > 0);
  const days = daysResponseSchema.parse(
    await (
      await postJson(shop.app, "/api/days", {
        store_id: shop.store.storeId,
        cart: [
          { pack_id: shop.store.items.mysorePak.packs[0].id, quantity: 1 },
        ],
      })
    ).json(),
  );
  assert.ok(days.days.every((day) => !day.fits));
  assert.ok(days.days.every((day) => day.reason === "not_taking_orders"));
  const { response: refused } = await shop.checkout();
  assert.equal(refused.status, 409);
  assert.equal((await errorOf(refused)).code, "store_not_taking_orders");

  const back = await put(shop, "/api/desk/paused", { paused: false });
  assert.deepEqual(pausedSchema.parse(await back.json()), { paused: false });
  assert.equal((await storePage(shop)).store.paused, false);
  const { response: taken } = await shop.checkout();
  assert.equal(taken.status, 201, await taken.clone().text());
});

test("one touch closes a day, and one more opens it again", async () => {
  const shop = orderApp();
  const path = `/api/desk/closed-dates/${sunday}`;
  for (let round = 0; round < 2; round += 1) {
    const response = await put(shop, path, { closed: true });
    assert.equal(response.status, 200);
    assert.deepEqual(closedDayAnswerSchema.parse(await response.json()), {
      day: sunday,
      closed: true,
    });
  }
  assert.deepEqual((await deskStore(shop)).closed_dates, [sunday]);
  assert.deepEqual((await storePage(shop)).days.closed_dates, [sunday]);
  const { response: refused } = await shop.checkout({ day: sunday });
  assert.equal(refused.status, 409);
  assert.equal((await errorOf(refused)).code, "day_closed");

  const opened = await put(shop, path, { closed: false });
  assert.deepEqual(closedDayAnswerSchema.parse(await opened.json()), {
    day: sunday,
    closed: false,
  });
  assert.deepEqual((await deskStore(shop)).closed_dates, []);
  const { response: taken } = await shop.checkout({ day: sunday });
  assert.equal(taken.status, 201, await taken.clone().text());
});

test("the desk store lists her closed days from today, in order", async () => {
  const shop = orderApp();
  const late = addDays(today, 60);
  for (const day of [late, sunday, today]) {
    assert.equal(
      (await put(shop, `/api/desk/closed-dates/${day}`, { closed: true }))
        .status,
      200,
    );
  }
  shop.deps.db
    .prepare("INSERT INTO closed_dates (store_id, date) VALUES (?, ?)")
    .run(shop.store.storeId, addDays(today, -3));
  assert.deepEqual((await deskStore(shop)).closed_dates, [today, sunday, late]);
});

test("a closed day is a real day from today to a year ahead", async () => {
  const shop = orderApp();
  const cases = [
    [addDays(today, -1), "day_past"],
    [addDays(today, closeAheadDays + 1), "day_too_far"],
    ["2026-02-30", "invalid_input"],
    ["sunday", "invalid_input"],
  ] as const;
  for (const [day, code] of cases) {
    const response = await put(shop, `/api/desk/closed-dates/${day}`, {
      closed: true,
    });
    assert.equal(response.status, 400, day);
    assert.equal((await errorOf(response)).code, code, day);
  }
  const last = addDays(today, closeAheadDays);
  const response = await put(shop, `/api/desk/closed-dates/${last}`, {
    closed: true,
  });
  assert.equal(response.status, 200);
});

test("a stock change from another site is refused", async () => {
  const shop = orderApp();
  const response = await shop.desk("/api/desk/paused", {
    method: "PUT",
    headers: { "Sec-Fetch-Site": "cross-site" },
    body: JSON.stringify({ paused: true }),
  });
  assert.equal(response.status, 403);
  assert.equal((await errorOf(response)).code, "forbidden");
  assert.equal((await deskStore(shop)).store.paused, false);
});
