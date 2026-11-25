import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { deskSessionSchema, deskStoreSchema } from "../../shared/desk.ts";
import { errorBodySchema } from "../../shared/errors.ts";
import {
  checkoutAnswerSchema,
  dailyListSchema,
  deskBoardSchema,
  deskDayCheckAnswerSchema,
  deskOrderAnswerSchema,
  deskRemovedSchema,
  orderPageSchema,
  undoWindowMs,
} from "../../shared/orders.ts";
import { sseReader } from "../events/test-sse.ts";
import { seedStore } from "../test-store.ts";
import { signIn } from "../verify/test-sign-in.ts";
import {
  deskBody,
  demoToken,
  orderApp,
  publicUrl,
  saturday,
  sunday,
  today,
} from "./test-orders.ts";

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

async function answerOf(response: Response) {
  assert.ok(response.ok, await response.clone().text());
  return deskOrderAnswerSchema.parse(await response.json());
}

const reading = (edited: boolean) => ({
  order_id: randomUUID(),
  transcript: "ಶನಿವಾರಕ್ಕೆ ಒಂದು ಕೆಜಿ ಚಕ್ಕುಲಿ ಬೇಕು",
  language: "kn-IN",
  variant: "native",
  edited,
});

test("each desk route needs the seller session or the demo token", async () => {
  const shop = orderApp();
  for (const [method, path] of [
    ["GET", "/api/desk/orders"],
    ["POST", "/api/desk/orders"],
    ["PATCH", `/api/desk/orders/${randomUUID()}`],
    ["GET", "/api/desk/daily"],
    ["GET", "/api/desk/events"],
  ] as const) {
    const response = await shop.app.request(path, {
      method,
      headers: { "Idempotency-Key": randomUUID() },
    });
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.equal((await errorOf(response)).code, "not_signed_in");
  }
});

test("the desk store gives her store, her language, her menu, the flags and the mode", async () => {
  const shop = orderApp();
  const response = await shop.desk("/api/desk/store");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const answer = deskStoreSchema.parse(await response.json());
  assert.deepEqual(answer.store, {
    id: shop.store.storeId,
    slug: "shobhas-kitchen",
    name: "Shobha's Kitchen",
    area: "Basavanagudi",
    city: "Bengaluru",
    is_demo: true,
    limit_unit: "kg",
    daily_limit: 25000,
    offers_pickup: true,
    offers_delivery: true,
    paused: false,
    bulk_on: false,
    catering_on: false,
    normal_orders_on: true,
  });
  assert.equal(answer.voice_samples, true);
  assert.deepEqual(answer.closed_dates, []);
  assert.equal(answer.seller_language, "kn");
  assert.deepEqual(
    answer.menu.map((item) => [
      item.name,
      item.packs.map((pack) => pack.label),
    ]),
    [
      ["Mysore pak", ["250 g", "500 g", "1 kg"]],
      ["Chakkuli", ["250 g", "500 g", "1 kg"]],
      ["Kaju katli", ["250 g", "500 g", "1 kg"]],
    ],
  );
  assert.deepEqual(answer.flags, { ops_voice: true });
  assert.equal(answer.recorded, true);
  const logged = shop.logs().find((line) => line.route === "/api/desk/store");
  assert.deepEqual(logged?.flags, { ops_voice: "on" });
});

test("the desk store follows ops_voice and the Sarvam mode", async () => {
  const shop = orderApp(
    {},
    {
      env: { SARVAM_MODE: "live", SARVAM_API_KEY: "test-key" },
      flagValues: { ops_voice: false },
    },
  );
  const answer = deskStoreSchema.parse(
    await (await shop.desk("/api/desk/store")).json(),
  );
  assert.deepEqual(answer.flags, { ops_voice: false });
  assert.equal(answer.recorded, false);
});

test("the desk store of a seller session is her own store", async () => {
  const shop = orderApp();
  const kitchen = seedStore(shop.deps.db, {
    slug: "test-kitchen",
    name: "Test Kitchen",
    phone: "+919800000002",
    language: "hi",
    dailyLimit: null,
  });
  const cookie = await signIn(shop.app, kitchen.phone);
  const answer = deskStoreSchema.parse(
    await (
      await shop.app.request("/api/desk/store", { headers: { Cookie: cookie } })
    ).json(),
  );
  assert.equal(answer.store.id, kitchen.storeId);
  assert.equal(answer.store.is_demo, false);
  assert.equal(answer.voice_samples, false);
  assert.equal(answer.store.daily_limit, null);
  assert.equal(answer.seller_language, "hi");
});

test("the desk store needs the seller session or the demo token", async () => {
  const shop = orderApp();
  const response = await shop.app.request("/api/desk/store");
  assert.equal(response.status, 401);
  assert.equal((await errorOf(response)).code, "not_signed_in");
});

test("the seller session opens the desk routes of her own store", async () => {
  const shop = orderApp();
  const kitchen = seedStore(shop.deps.db, {
    slug: "test-kitchen",
    phone: "+919800000002",
    dailyLimit: null,
  });
  const cookie = await signIn(shop.app, kitchen.phone);
  const saved = await shop.app.request("/api/desk/orders", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(deskBody(kitchen)),
  });
  assert.equal(saved.status, 201);
  const board = deskBoardSchema.parse(
    await (
      await shop.app.request("/api/desk/orders", {
        headers: { Cookie: cookie },
      })
    ).json(),
  );
  assert.equal(board.days.length, 1);
  assert.equal(board.daily_limit, null);
  const hero = deskBoardSchema.parse(
    await (await shop.desk("/api/desk/orders")).json(),
  );
  assert.equal(hero.days.length, 0);
});

test("a typed order is a desk order with no message and a Send on WhatsApp link", async () => {
  const shop = orderApp();
  await shop.checkout();
  const { order, warning } = await answerOf(
    await shop.deskPost(
      deskBody(shop.store, {
        buyer_phone: "98450 12345",
        fulfilment: "delivery",
        address: "Malleshwaram",
      }),
    ),
  );
  assert.equal(warning, null);
  assert.equal(order.number, 2);
  assert.equal(order.source, "desk");
  assert.equal(order.status, "new");
  assert.equal(order.next_stamp, "making");
  assert.equal(order.buyer_phone, "+919845012345");
  assert.equal(order.buyer_language, "kn");
  assert.deepEqual(order.messages, []);
  assert.equal(order.order_url, `${publicUrl}/o/${order.token}`);
  const share = new URL(order.share_url ?? "");
  assert.equal(share.pathname, "/919845012345");
  assert.match(
    share.searchParams.get("text") ?? "",
    new RegExp(order.order_url),
  );
  assert.equal(
    shop.deps.db
      .prepare("SELECT count(*) FROM messages WHERE order_id = ?")
      .pluck()
      .get(order.id),
    0,
  );
  const metrics = await (await shop.app.request("/metrics")).text();
  assert.match(
    metrics,
    /orders_created_total\{source="desk",language="kn-IN",variant="none",edited="none"\} 1/,
  );
});

test("each order line shows the food mark and the Latin name of its dish, on the slip and on the order page", async () => {
  const shop = orderApp();
  shop.deps.db
    .prepare(
      "UPDATE items SET name = 'ಚಕ್ಕುಲಿ', name_latin = 'Chakkuli', veg_mark = 'egg' WHERE id = ?",
    )
    .run(shop.store.items.chakkuli.id);
  const { order } = await answerOf(await shop.deskPost(deskBody(shop.store)));
  const marks = (lines: readonly { veg_mark: string; name_latin: unknown }[]) =>
    lines.map(({ veg_mark, name_latin }) => [veg_mark, name_latin]);
  assert.deepEqual(marks(order.lines), [["egg", "Chakkuli"]]);
  const response = await shop.app.request(`/api/orders/${order.token}`);
  assert.equal(response.status, 200);
  const page = orderPageSchema.parse(await response.json());
  assert.equal(page.lines[0]?.name, "ಚಕ್ಕುಲಿ");
  assert.deepEqual(marks(page.lines), [["egg", "Chakkuli"]]);
});

test("a desk order with no buyer number lets her pick the contact", async () => {
  const shop = orderApp();
  const { order } = await answerOf(await shop.deskPost(deskBody(shop.store)));
  assert.equal(new URL(order.share_url ?? "").pathname, "/");
});

test("a draft saved unedited keeps the reading and records a conversion", async () => {
  const shop = orderApp();
  const draft = reading(false);
  const { order } = await answerOf(
    await shop.deskPost(deskBody(shop.store, { reading: draft })),
  );
  assert.equal(order.id, draft.order_id);
  assert.deepEqual(order.reading, {
    language: "kn-IN",
    variant: "native",
    edited: false,
  });
  assert.deepEqual(shop.flags.conversions, [], "not before the undo window");
  assert.deepEqual(
    shop.deps.db
      .prepare(
        "SELECT transcript, reading_language, reading_variant, edited FROM orders WHERE id = ?",
      )
      .get(draft.order_id),
    {
      transcript: draft.transcript,
      reading_language: "kn-IN",
      reading_variant: "native",
      edited: 0,
    },
  );
  const metrics = await (await shop.app.request("/metrics")).text();
  assert.match(
    metrics,
    /orders_created_total\{source="desk",language="kn-IN",variant="native",edited="false"\} 1/,
  );
  const logged = shop.logs().find((line) => line.route === "/api/desk/orders");
  assert.deepEqual(logged?.flags, { reading_variant: "native" });
  const again = await shop.deskPost(deskBody(shop.store, { reading: draft }));
  assert.equal(again.status, 409);
  assert.equal((await errorOf(again)).code, "order_exists");
});

test("an edited draft and a load order record no conversion", async () => {
  const shop = orderApp();
  await answerOf(
    await shop.deskPost(deskBody(shop.store, { reading: reading(true) })),
  );
  await answerOf(
    await shop.deskPost(
      deskBody(shop.store, { reading: reading(false), source: "load" }),
    ),
  );
  assert.deepEqual(shop.flags.conversions, []);
  const metrics = await (await shop.app.request("/metrics")).text();
  assert.match(
    metrics,
    /source="desk",language="kn-IN",variant="native",edited="true"\} 1/,
  );
  assert.match(
    metrics,
    /source="load",language="kn-IN",variant="native",edited="false"\} 1/,
  );
});

test("a reading with no variant is saved with the label none", async () => {
  const shop = orderApp();
  const draft = { ...reading(false), variant: null, language: null };
  const { order } = await answerOf(
    await shop.deskPost(deskBody(shop.store, { reading: draft })),
  );
  assert.deepEqual(order.reading, {
    language: null,
    variant: null,
    edited: false,
  });
  const metrics = await (await shop.app.request("/metrics")).text();
  assert.match(
    metrics,
    /orders_created_total\{source="desk",language="kn-IN",variant="none",edited="false"\} 1/,
  );
});

test("a slip keeps the pack of an order after she removes the pack", async () => {
  const shop = orderApp();
  const { order } = await answerOf(await shop.deskPost(deskBody(shop.store)));
  shop.deps.db
    .prepare("DELETE FROM packs WHERE id = ?")
    .run(shop.store.items.chakkuli.packs[2].id);
  const board = deskBoardSchema.parse(
    await (await shop.desk("/api/desk/orders")).json(),
  );
  assert.deepEqual(
    board.days[0]?.slips[0]?.lines.map((line) => line.label),
    ["1 kg"],
  );
});

test("a full day gives her a warning with the next day, and the order is saved", async () => {
  const shop = orderApp();
  await shop.fillDay(saturday, 24);
  const { order, warning } = await answerOf(
    await shop.deskPost(
      deskBody(shop.store, {
        cart: [{ pack_id: shop.store.items.chakkuli.packs[2].id, quantity: 2 }],
      }),
    ),
  );
  assert.equal(order.day, saturday);
  assert.deepEqual(warning, {
    day: saturday,
    reason: "not_enough_space",
    space_left: 1000,
    next_free_day: sunday,
  });
});

test("a retry of a desk save with the same key saves one order", async () => {
  const shop = orderApp();
  const key = randomUUID();
  const first = await shop.deskPost(deskBody(shop.store), key);
  const replay = await shop.deskPost(deskBody(shop.store), key);
  assert.equal(replay.headers.get("Idempotent-Replayed"), "true");
  assert.deepEqual(await replay.json(), await first.json());
  assert.equal(
    shop.deps.db.prepare("SELECT count(*) FROM orders").pluck().get(),
    1,
  );
});

test("the same idempotency key from two stores makes two orders", async () => {
  const shop = orderApp();
  const kitchen = seedStore(shop.deps.db, {
    slug: "test-kitchen",
    phone: "+919800000002",
    dailyLimit: null,
  });
  const cookie = await signIn(shop.app, kitchen.phone);
  const key = "shared-key-0001";
  const hero = await shop.deskPost(
    deskBody(shop.store, { buyer_phone: "+919811112222" }),
    key,
  );
  assert.equal(hero.status, 201);
  const other = await shop.app.request("/api/desk/orders", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(deskBody(kitchen, { buyer_name: "Someone else" })),
  });
  assert.equal(other.status, 201);
  assert.equal(other.headers.get("Idempotent-Replayed"), null);
  const { order } = deskOrderAnswerSchema.parse(await other.json());
  assert.equal(order.buyer_name, "Someone else");
  assert.equal(order.buyer_phone, null);
  const count = (storeId: string) =>
    shop.deps.db
      .prepare("SELECT count(*) FROM orders WHERE store_id = ?")
      .pluck()
      .get(storeId);
  assert.equal(count(shop.store.storeId), 1);
  assert.equal(count(kitchen.storeId), 1);
});

test("a desk save refuses a bad body", async () => {
  const shop = orderApp();
  for (const overrides of [
    { cart: [] },
    { day: "2026-11-23" },
    { fulfilment: "courier" },
    { buyer_phone: "12345" },
    { reading: { ...reading(false), order_id: "not-a-uuid" } },
    { reading: { ...reading(false), variant: "other" } },
    { cart: [{ pack_id: randomUUID(), quantity: 1 }] },
  ]) {
    const response = await shop.deskPost(deskBody(shop.store, overrides));
    assert.ok(
      [400, 409].includes(response.status),
      `${JSON.stringify(overrides)}: ${response.status}`,
    );
  }
  assert.equal(
    shop.deps.db.prepare("SELECT count(*) FROM orders").pluck().get(),
    0,
  );
});

test("the board shows her orders by day, with the stamps of each slip", async () => {
  const shop = orderApp();
  const other = seedStore(shop.deps.db, {
    slug: "ghar-ki-mithai",
    phone: "+919800000003",
  });
  await shop.checkout();
  await answerOf(await shop.deskPost(deskBody(shop.store, { day: sunday })));
  await answerOf(await shop.deskPost(deskBody(shop.store)));
  shop.deps.db
    .prepare(
      `INSERT INTO orders (id, store_id, number, token, source, status, fulfilment, day, total, created_at)
      VALUES (?, ?, 1, 'other-store-order-token', 'desk', 'new', 'pickup', ?, 0, 0)`,
    )
    .run(randomUUID(), other.storeId, saturday);
  const response = await shop.desk("/api/desk/orders");
  assert.equal(response.status, 200);
  const board = deskBoardSchema.parse(await response.json());
  assert.equal(board.today, today);
  assert.equal(board.limit_unit, "kg");
  assert.equal(board.daily_limit, 25000);
  assert.deepEqual(
    board.days.map((day) => [
      day.day,
      day.load,
      day.space_left,
      day.slips.map((slip) => slip.number),
    ]),
    [
      [saturday, 2000, 23000, [1, 3]],
      [sunday, 1000, 24000, [2]],
    ],
  );
  const slip = board.days[0]?.slips[0];
  assert.equal(slip?.status, "new");
  assert.equal(slip?.next_stamp, "making");
  assert.equal(slip?.paid, false);
  assert.equal(slip?.messages[0]?.template, "order_placed");
});

test("the board keeps open orders of past days, and takes a range", async () => {
  const shop = orderApp();
  shop.deps.db
    .prepare(
      `INSERT INTO orders (id, store_id, number, token, source, status, fulfilment, day, total, created_at)
      VALUES (?, ?, 1, 'yesterday-ready-order-token', 'desk', 'ready', 'pickup', '2026-11-23', 0, 0),
        (?, ?, 2, 'yesterday-done-order-token0', 'desk', 'picked_up', 'pickup', '2026-11-23', 0, 0)`,
    )
    .run(randomUUID(), shop.store.storeId, randomUUID(), shop.store.storeId);
  await answerOf(await shop.deskPost(deskBody(shop.store, { day: sunday })));
  const board = deskBoardSchema.parse(
    await (await shop.desk("/api/desk/orders")).json(),
  );
  assert.deepEqual(
    board.days.map((day) => [day.day, day.slips.map((slip) => slip.number)]),
    [
      ["2026-11-23", [1]],
      [sunday, [3]],
    ],
  );
  const range = deskBoardSchema.parse(
    await (
      await shop.desk(`/api/desk/orders?from=${saturday}&to=${saturday}`)
    ).json(),
  );
  assert.deepEqual(
    range.days.map((day) => day.day),
    ["2026-11-23"],
  );
  for (const query of [
    "from=2026-11-30&to=2026-11-29",
    "from=2026-11-01&to=2027-11-01",
    "from=soon",
  ]) {
    const response = await shop.desk(`/api/desk/orders?${query}`);
    assert.equal(response.status, 400, query);
  }
});

test("stamps follow NEW, MAKING, READY and PICKED UP, one step at a time", async (t) => {
  const shop = orderApp();
  const placed = checkoutAnswerSchema.parse(
    await (await shop.checkout()).response.json(),
  );
  const board = deskBoardSchema.parse(
    await (await shop.desk("/api/desk/orders")).json(),
  );
  const id = board.days[0]?.slips[0]?.id ?? "";
  const events = sseReader(
    await shop.app.request(`/api/desk/events?demo=${demoToken}`),
  );
  t.after(() => events.cancel());
  await events.next();
  const stamp = (status: string) =>
    shop.deskPatch(id, { action: "stamp", status });

  assert.equal(
    (await answerOf(await stamp("making"))).order.next_stamp,
    "ready",
  );
  const changed = await events.nextOf("order_changed");
  assert.equal(JSON.parse(changed?.data ?? "{}").status, "making");
  const skip = await stamp("picked_up");
  assert.equal(skip.status, 409);
  const error = await errorOf(skip);
  assert.equal(error.code, "stamp_not_allowed");
  assert.match(error.message, /Its next stamp is ready\./);
  const wrongEnd = await stamp("delivered");
  assert.equal(wrongEnd.status, 409);
  assert.equal((await answerOf(await stamp("ready"))).order.status, "ready");
  assert.equal((await answerOf(await stamp("making"))).order.status, "making");
  await answerOf(await stamp("ready"));
  const done = await answerOf(await stamp("picked_up"));
  assert.equal(done.order.status, "picked_up");
  assert.equal(done.order.next_stamp, null);
  const page = orderPageSchema.parse(
    await (await shop.app.request(`/api/orders/${placed.token}`)).json(),
  );
  assert.equal(page.status, "picked_up");
});

test("she stamps PAID by hand, and can take it back", async () => {
  const shop = orderApp();
  const { order } = await answerOf(await shop.deskPost(deskBody(shop.store)));
  const paid = await answerOf(
    await shop.deskPatch(order.id, { action: "paid", paid: true }),
  );
  assert.equal(paid.order.paid, true);
  const unpaid = await answerOf(
    await shop.deskPatch(order.id, { action: "paid", paid: false }),
  );
  assert.equal(unpaid.order.paid, false);
});

test("a cancel takes one of the four reasons, tells the buyer, and frees the space", async () => {
  const shop = orderApp();
  const big = await shop.fillDay(saturday, 24);
  const placed = await shop.checkout({ buyer_language: "en" });
  assert.equal(placed.response.status, 201);
  const board = deskBoardSchema.parse(
    await (await shop.desk("/api/desk/orders")).json(),
  );
  const buyerOrder = board.days[0]?.slips.find(
    (slip) => slip.source === "link",
  );
  assert.ok(buyerOrder);
  const wrong = await shop.deskPatch(buyerOrder.id, {
    action: "cancel",
    reason: "no reason",
  });
  assert.equal(wrong.status, 400);
  const cancelled = await answerOf(
    await shop.deskPatch(buyerOrder.id, {
      action: "cancel",
      reason: "item_ran_out",
    }),
  );
  assert.equal(cancelled.order.status, "cancelled");
  assert.equal(cancelled.order.cancel_reason, "item_ran_out");
  assert.equal(cancelled.order.next_stamp, null);
  assert.match(
    cancelled.order.messages.at(-1)?.body ?? "",
    /is cancelled\.\nReason: An item ran out\./,
  );
  const again = await shop.deskPatch(buyerOrder.id, {
    action: "cancel",
    reason: "item_ran_out",
  });
  assert.equal(again.status, 200);
  assert.equal((await answerOf(again)).order.messages.length, 2);
  await answerOf(
    await shop.deskPatch(big.id, { action: "cancel", reason: "day_full" }),
  );
  const daily = dailyListSchema.parse(
    await (await shop.desk("/api/desk/daily")).json(),
  );
  assert.equal(daily.days.length, 0);
  const fits = await shop.checkout({
    cart: [
      {
        pack_id: shop.store.items.mysorePak.packs[2].id,
        quantity: 25,
        price: 88000,
      },
    ],
  });
  assert.equal(fits.response.status, 201);
  const stamp = await shop.deskPatch(buyerOrder.id, {
    action: "stamp",
    status: "making",
  });
  assert.equal(stamp.status, 409);
  const edit = await shop.deskPatch(buyerOrder.id, {
    action: "edit",
    ...deskBody(shop.store),
  });
  assert.equal(edit.status, 409);
  assert.equal((await errorOf(edit)).code, "order_closed");
});

test("an edit checks the daily limit again and keeps the prices of the order", async () => {
  const shop = orderApp();
  const { response, phone } = await shop.checkout({ buyer_language: "en" });
  const placed = checkoutAnswerSchema.parse(await response.json());
  const id =
    deskBoardSchema.parse(await (await shop.desk("/api/desk/orders")).json())
      .days[0]?.slips[0]?.id ?? "";
  const pak = shop.store.items.mysorePak.packs[2];
  const chakkuli = shop.store.items.chakkuli.packs[1];
  shop.deps.db
    .prepare("UPDATE packs SET price = 99000 WHERE id = ?")
    .run(pak.id);
  const edit = (quantity: number, day = saturday) =>
    shop.deskPatch(id, {
      action: "edit",
      day,
      fulfilment: "pickup",
      buyer_name: "Priya",
      note: "less sugar",
      buyer_phone: "+919999999999",
      cart: [
        { pack_id: pak.id, quantity },
        { pack_id: chakkuli.id, quantity: 1 },
      ],
    });
  const bigger = await answerOf(await edit(25));
  assert.equal(bigger.order.total, 25 * 88000 + chakkuli.price);
  assert.equal(bigger.order.note, "less sugar");
  assert.equal(bigger.order.buyer_phone, phone);
  assert.deepEqual(bigger.warning, {
    day: saturday,
    reason: "not_enough_space",
    space_left: 25000,
    next_free_day: null,
  });
  assert.match(
    bigger.order.messages.at(-1)?.body ?? "",
    /has changed\.\n25 × Mysore pak 1 kg/,
  );
  const smaller = await answerOf(await edit(2, sunday));
  assert.equal(smaller.warning, null);
  assert.equal(smaller.order.day, sunday);
  const same = await answerOf(await edit(2, sunday));
  assert.equal(same.order.messages.length, smaller.order.messages.length);
  const page = orderPageSchema.parse(
    await (await shop.app.request(`/api/orders/${placed.token}`)).json(),
  );
  assert.equal(page.day, sunday);
  assert.equal(page.lines.length, 2);
});

test("an order of another store is not on her desk", async () => {
  const shop = orderApp();
  const other = seedStore(shop.deps.db, {
    slug: "ghar-ki-mithai",
    phone: "+919800000003",
  });
  const id = randomUUID();
  shop.deps.db
    .prepare(
      `INSERT INTO orders (id, store_id, number, token, source, status, fulfilment, day, total, created_at)
      VALUES (?, ?, 1, 'other-store-order-token', 'desk', 'new', 'pickup', ?, 0, 0)`,
    )
    .run(id, other.storeId, saturday);
  const response = await shop.deskPatch(id, {
    action: "stamp",
    status: "making",
  });
  assert.equal(response.status, 404);
  const invalid = await shop.deskPatch(id, { action: "delete" });
  assert.equal(invalid.status, 400);
});

test("the daily list totals each item against her limit, and the money", async () => {
  const shop = orderApp();
  const { order } = await answerOf(
    await shop.deskPost(
      deskBody(shop.store, {
        cart: [
          { pack_id: shop.store.items.mysorePak.packs[2].id, quantity: 2 },
          { pack_id: shop.store.items.chakkuli.packs[1].id, quantity: 1 },
        ],
      }),
    ),
  );
  await answerOf(
    await shop.deskPatch(order.id, { action: "paid", paid: true }),
  );
  await shop.checkout();
  const response = await shop.desk("/api/desk/daily");
  assert.equal(response.status, 200);
  const daily = dailyListSchema.parse(await response.json());
  assert.equal(daily.today, today);
  assert.equal(daily.daily_limit, 25000);
  const [day] = daily.days;
  assert.deepEqual(
    { ...day, items: undefined },
    {
      day: saturday,
      load: 3500,
      space_left: 21500,
      closed: false,
      orders: 2,
      value: 2 * 88000 + 21000 + 88000,
      paid: 2 * 88000 + 21000,
      owed: 88000,
      items: undefined,
    },
  );
  assert.deepEqual(day?.items, [
    {
      item_id: shop.store.items.mysorePak.id,
      name: "Mysore pak",
      grams: 3000,
      pieces: null,
      packs: [{ label: "1 kg", quantity: 3 }],
    },
    {
      item_id: shop.store.items.chakkuli.id,
      name: "Chakkuli",
      grams: 500,
      pieces: null,
      packs: [{ label: "500 g", quantity: 1 }],
    },
  ]);
  assert.deepEqual(daily.last_30_days, {
    from: "2026-10-26",
    to: today,
    orders: 0,
    value: 0,
    paid: 0,
    owed: 0,
  });
  shop.clock.advance(5 * 24 * 60 * 60 * 1000);
  const later = dailyListSchema.parse(
    await (await shop.desk("/api/desk/daily")).json(),
  );
  assert.equal(later.last_30_days.orders, 2);
  assert.equal(later.last_30_days.owed, 88000);
});

test("the session check answers without an error, signed in or not", async () => {
  const shop = orderApp();
  const ask = async (headers: Record<string, string> = {}) => {
    const response = await shop.app.request("/api/desk/session", { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    return deskSessionSchema.parse(await response.json()).signed_in;
  };
  assert.equal(await ask(), false);
  assert.equal(await ask({ "X-Demo-Token": "not-the-demo-token-0000" }), false);
  assert.equal(await ask({ "X-Demo-Token": demoToken }), true);
  const kitchen = seedStore(shop.deps.db, {
    slug: "test-kitchen",
    phone: "+919800000002",
    dailyLimit: null,
  });
  assert.equal(
    await ask({ Cookie: await signIn(shop.app, kitchen.phone) }),
    true,
  );
});

test("a saved reading counts for the experiment only after the undo window", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const shop = orderApp();
  const draft = reading(false);
  await answerOf(await shop.deskPost(deskBody(shop.store, { reading: draft })));
  t.mock.timers.tick(undoWindowMs - 1);
  assert.deepEqual(shop.flags.conversions, []);
  t.mock.timers.tick(1);
  assert.deepEqual(shop.flags.conversions, [`order:${draft.order_id}`]);
});

test("Undo of a desk save removes the order: no slip stays, and the experiment counts nothing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const shop = orderApp();
  const events = sseReader(
    await shop.app.request(`/api/desk/events?demo=${demoToken}`),
  );
  t.after(() => events.cancel());
  await events.next();
  const draft = reading(false);
  const { order } = await answerOf(
    await shop.deskPost(deskBody(shop.store, { reading: draft })),
  );
  const removed = await shop.desk(`/api/desk/orders/${order.id}`, {
    method: "DELETE",
  });
  assert.equal(removed.status, 200, await removed.clone().text());
  assert.deepEqual(deskRemovedSchema.parse(await removed.json()), {
    removed: order.id,
  });
  const gone = await events.nextOf("order_removed");
  assert.deepEqual(JSON.parse(gone?.data ?? "{}"), { id: order.id });
  t.mock.timers.tick(undoWindowMs);
  assert.deepEqual(shop.flags.conversions, []);
  const board = deskBoardSchema.parse(
    await (await shop.desk("/api/desk/orders")).json(),
  );
  assert.deepEqual(board.days, []);
  assert.equal(
    shop.deps.db.prepare("SELECT count(*) FROM orders").pluck().get(),
    0,
  );
  const again = await shop.desk(`/api/desk/orders/${order.id}`, {
    method: "DELETE",
  });
  assert.equal(again.status, 404);
  const saved = await answerOf(
    await shop.deskPost(deskBody(shop.store, { reading: draft })),
  );
  assert.equal(saved.order.id, draft.order_id, "she can save it again");
});

test("Undo takes back only a desk order saved a moment ago that has not changed", async () => {
  const shop = orderApp();
  const remove = (id: string) =>
    shop.desk(`/api/desk/orders/${id}`, { method: "DELETE" });
  const late = (await answerOf(await shop.deskPost(deskBody(shop.store))))
    .order;
  shop.clock.advance(undoWindowMs + 6_000);
  const tooLate = await remove(late.id);
  assert.equal(tooLate.status, 409);
  assert.equal((await errorOf(tooLate)).code, "order_closed");

  const stamped = (await answerOf(await shop.deskPost(deskBody(shop.store))))
    .order;
  await answerOf(
    await shop.deskPatch(stamped.id, { action: "stamp", status: "making" }),
  );
  assert.equal((await remove(stamped.id)).status, 409);

  const paid = (await answerOf(await shop.deskPost(deskBody(shop.store))))
    .order;
  await answerOf(await shop.deskPatch(paid.id, { action: "paid", paid: true }));
  assert.equal((await remove(paid.id)).status, 409);

  await shop.checkout();
  const board = deskBoardSchema.parse(
    await (await shop.desk("/api/desk/orders")).json(),
  );
  const buyers = board.days
    .flatMap((day) => day.slips)
    .find((slip) => slip.source === "link");
  assert.ok(buyers);
  assert.equal((await remove(buyers.id)).status, 409);
  assert.equal(
    shop.deps.db.prepare("SELECT count(*) FROM orders").pluck().get(),
    4,
  );
});

test("the day check of a change warns before anything is saved", async () => {
  const shop = orderApp();
  await shop.fillDay(saturday, 22);
  const order = (await answerOf(await shop.deskPost(deskBody(shop.store))))
    .order;
  const check = async (body: Record<string, unknown>) => {
    const response = await shop.desk(`/api/desk/orders/${order.id}/day-check`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return deskDayCheckAnswerSchema.parse(await response.json()).warning;
  };
  const kilo = shop.store.items.chakkuli.packs[2].id;
  assert.deepEqual(
    await check({ day: saturday, cart: [{ pack_id: kilo, quantity: 4 }] }),
    {
      day: saturday,
      reason: "not_enough_space",
      space_left: 3000,
      next_free_day: sunday,
    },
  );
  assert.equal(
    await check({ day: saturday, cart: [{ pack_id: kilo, quantity: 1 }] }),
    null,
    "a change that adds nothing to the day",
  );
  assert.equal(
    await check({ day: sunday, cart: [{ pack_id: kilo, quantity: 4 }] }),
    null,
  );
  const board = deskBoardSchema.parse(
    await (await shop.desk("/api/desk/orders")).json(),
  );
  const same = board.days
    .flatMap((day) => day.slips)
    .find((slip) => slip.id === order.id);
  assert.equal(same?.lines[0]?.quantity, 1, "the check saves nothing");
  const unknown = await shop.desk(
    `/api/desk/orders/${randomUUID()}/day-check`,
    {
      method: "POST",
      body: JSON.stringify({
        day: saturday,
        cart: [{ pack_id: kilo, quantity: 1 }],
      }),
    },
  );
  assert.equal(unknown.status, 404);
});

test("each refund stays on its order: cash gives back the total, online the payment", async () => {
  const shop = orderApp();
  const cash = (await answerOf(await shop.deskPost(deskBody(shop.store))))
    .order;
  await answerOf(await shop.deskPatch(cash.id, { action: "paid", paid: true }));
  await answerOf(
    await shop.deskPatch(cash.id, { action: "cancel", reason: "item_ran_out" }),
  );
  const refunded = await answerOf(
    await shop.desk(`/api/desk/orders/${cash.id}/refund`, { method: "POST" }),
  );
  assert.equal(refunded.order.paid, false);
  assert.deepEqual(refunded.order.refund, {
    amount: cash.total,
    online: false,
  });
  assert.equal(refunded.order.refunded, false);
  const board = deskBoardSchema.parse(
    await (await shop.desk("/api/desk/orders")).json(),
  );
  const reloaded = board.days
    .flatMap((day) => day.slips)
    .find((slip) => slip.id === cash.id);
  assert.equal(reloaded?.status, "cancelled");
  assert.deepEqual(reloaded?.refund, { amount: cash.total, online: false });
  const retry = await shop.desk(`/api/desk/orders/${cash.id}/refund`, {
    method: "POST",
  });
  assert.equal(retry.status, 200, "a retry of the refund is no error");
});
