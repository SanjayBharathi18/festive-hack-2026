import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { errorBodySchema } from "../../shared/errors.ts";
import { checkoutAnswerSchema, orderPageSchema } from "../../shared/orders.ts";
import { sseReader } from "../events/test-sse.ts";
import { demoTokenHeader } from "../verify/desk-auth.ts";
import { orderProof, postJson } from "../verify/test-sign-in.ts";
import {
  checkoutBody,
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

test("a verified buyer places an order, and the desk hears of it", async (t) => {
  const shop = orderApp();
  const events = await shop.app.request(`/api/desk/events?demo=${demoToken}`);
  const stream = sseReader(events);
  t.after(() => stream.cancel());
  await stream.next();
  const { response, phone } = await shop.checkout({ note: "less sugar" });
  assert.equal(response.status, 201);
  const answer = checkoutAnswerSchema.parse(await response.json());
  assert.equal(answer.order.number, 1);
  assert.equal(answer.order.status, "new");
  assert.equal(answer.order.paid, false);
  assert.equal(answer.order.total, 88000);
  assert.equal(answer.order.note, "less sugar");
  assert.deepEqual(
    answer.order.messages.map((message) => [message.template, message.channel]),
    [["order_placed", "simulated"]],
  );
  const row = shop.deps.db
    .prepare(
      "SELECT source, status, buyer_phone, buyer_language, payment_required, paid FROM orders",
    )
    .get();
  assert.deepEqual(row, {
    source: "link",
    status: "new",
    buyer_phone: phone,
    buyer_language: "kn",
    payment_required: 0,
    paid: 0,
  });
  assert.deepEqual(
    shop.deps.db
      .prepare("SELECT quantity, price, grams, pieces FROM order_items")
      .all(),
    [{ quantity: 1, price: 88000, grams: 1000, pieces: null }],
  );
  const event = await stream.nextOf("order_created");
  assert.equal(JSON.parse(event?.data ?? "{}").token, answer.token);
  const metrics = await (await shop.app.request("/metrics")).text();
  assert.match(
    metrics,
    /orders_created_total\{source="link",language="kn-IN",variant="none",edited="none"\} 1/,
  );
});

test("a retry with the same key gives the same answer and no second order", async () => {
  const shop = orderApp();
  const first = await shop.checkout();
  const body = { ...checkoutBody(shop.store, first.proof) };
  const replay = await postJson(shop.app, "/api/orders", body, {
    "Idempotency-Key": first.key,
  });
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get("Idempotent-Replayed"), "true");
  assert.deepEqual(await replay.json(), await first.response.json());
  assert.equal(
    shop.deps.db.prepare("SELECT count(*) FROM orders").pluck().get(),
    1,
  );
});

test("a key used again with another body is refused, and leaks nothing", async () => {
  const shop = orderApp();
  const first = await shop.checkout({
    fulfilment: "delivery",
    address: "House 9, Jayanagar",
  });
  assert.equal(first.response.status, 201);
  const second = await shop.checkout({ buyer_name: "Other buyer" }, first.key);
  assert.equal(second.response.status, 422);
  const text = await second.response.text();
  assert.equal(
    errorBodySchema.parse(JSON.parse(text)).error.code,
    "idempotency_key_reused",
  );
  assert.doesNotMatch(text, /Jayanagar|token/);
});

test("an order needs an idempotency key", async () => {
  const shop = orderApp();
  const response = await postJson(shop.app, "/api/orders", {});
  assert.equal(response.status, 400);
  assert.equal((await errorOf(response)).code, "idempotency_key_missing");
});

test("a code proof works for one order only", async () => {
  const shop = orderApp();
  const first = await shop.checkout();
  assert.equal(first.response.status, 201);
  for (const proof of [
    first.proof,
    "a-proof-that-the-server-never-made-0000",
  ]) {
    const again = await postJson(
      shop.app,
      "/api/orders",
      checkoutBody(shop.store, proof),
      { "Idempotency-Key": randomUUID() },
    );
    assert.equal(again.status, 401);
    assert.equal((await errorOf(again)).code, "proof_invalid");
  }
});

test("a proof expires after 15 minutes", async () => {
  const shop = orderApp();
  const proof = await orderProof(shop.app, "+919876599999");
  shop.clock.advance(15 * 60_000);
  const response = await postJson(
    shop.app,
    "/api/orders",
    checkoutBody(shop.store, proof),
    { "Idempotency-Key": randomUUID() },
  );
  assert.equal(response.status, 401);
  assert.equal((await errorOf(response)).code, "proof_invalid");
});

test("a body that is not a valid order is refused, and the proof stays good", async () => {
  const shop = orderApp();
  const pack = shop.store.items.mysorePak.packs[2];
  for (const overrides of [
    { fulfilment: "delivery" },
    { gift: { name: "Amma" } },
    { cart: [] },
    {
      cart: [
        { pack_id: pack.id, quantity: 1, price: pack.price },
        { pack_id: pack.id, quantity: 2, price: pack.price },
      ],
    },
    { cart: [{ pack_id: pack.id, quantity: 0, price: pack.price }] },
    { cart: [{ pack_id: pack.id, quantity: 1 }] },
    { day: "28-11-2026" },
    { buyer_name: " " },
    { buyer_language: "fr" },
  ]) {
    const { response } = await shop.checkout(overrides);
    assert.equal(response.status, 400, JSON.stringify(overrides));
    assert.equal((await errorOf(response)).code, "invalid_input");
  }
});

test("a delivery order keeps the address and the gift", async () => {
  const shop = orderApp();
  const { response } = await shop.checkout({
    fulfilment: "delivery",
    address: "4th Block, Jayanagar",
    gift: { name: "Amma", phone: "98450 12345", message: "Happy Diwali" },
  });
  assert.equal(response.status, 201);
  const { order } = checkoutAnswerSchema.parse(await response.json());
  assert.equal(order.address, "4th Block, Jayanagar");
  assert.deepEqual(order.gift, { name: "Amma", message: "Happy Diwali" });
  assert.equal(order.store.pickup, null);
  assert.deepEqual(
    shop.deps.db.prepare("SELECT gift_phone FROM orders").get(),
    { gift_phone: "+919845012345" },
  );
});

test("the store must take orders and offer the fulfilment", async () => {
  const paused = orderApp({ paused: true });
  const closed = await paused.checkout();
  assert.equal(closed.response.status, 409);
  assert.equal(
    (await errorOf(closed.response)).code,
    "store_not_taking_orders",
  );

  const deliveryOnly = orderApp({ offersPickup: false });
  const pickup = await deliveryOnly.checkout();
  assert.equal(pickup.response.status, 409);
  assert.equal((await errorOf(pickup.response)).code, "fulfilment_unavailable");

  const shop = orderApp();
  const unknown = await shop.checkout({
    store_id: "8f6b7a52-1f1e-4c2b-9a0d-3e4f5a6b7c8d",
  });
  assert.equal(unknown.response.status, 404);
});

test("the cart must match her menu and her prices", async () => {
  const shop = orderApp();
  const katli = shop.store.items.kajuKatli.packs[1];
  shop.deps.db
    .prepare("UPDATE items SET sold_out = 1 WHERE id = ?")
    .run(shop.store.items.kajuKatli.id);
  const soldOut = await shop.checkout({
    cart: [{ pack_id: katli.id, quantity: 1, price: katli.price }],
  });
  assert.equal(soldOut.response.status, 409);
  assert.equal((await errorOf(soldOut.response)).code, "item_sold_out");

  const pak = shop.store.items.mysorePak.packs[2];
  const oldPrice = await shop.checkout({
    cart: [{ pack_id: pak.id, quantity: 1, price: pak.price - 100 }],
  });
  assert.equal(oldPrice.response.status, 409);
  assert.equal((await errorOf(oldPrice.response)).code, "price_changed");

  const other = orderApp({ slug: "ghar-ki-mithai", phone: "+919800000003" });
  const foreign = await shop.checkout({
    cart: [
      {
        pack_id: other.store.items.mysorePak.packs[2].id,
        quantity: 1,
        price: 88000,
      },
    ],
  });
  assert.equal(foreign.response.status, 409);
  assert.equal((await errorOf(foreign.response)).code, "item_unavailable");
});

test("a full day is refused with the next day with space, and the proof stays good", async () => {
  const shop = orderApp();
  await shop.fillDay(saturday, 24);
  const fits = await shop.checkout();
  assert.equal(fits.response.status, 201);
  const full = await shop.checkout();
  assert.equal(full.response.status, 409);
  const error = await errorOf(full.response);
  assert.equal(error.code, "day_full");
  assert.match(error.message, /Saturday, 28 November is full/);
  assert.match(error.message, /Sunday, 29 November/);
  const retry = await postJson(
    shop.app,
    "/api/orders",
    { ...checkoutBody(shop.store, full.proof), day: sunday },
    { "Idempotency-Key": randomUUID() },
  );
  assert.equal(retry.status, 201);
});

test("a closed day or a past day is refused", async () => {
  const shop = orderApp();
  shop.deps.db
    .prepare("INSERT INTO closed_dates (store_id, date) VALUES (?, ?)")
    .run(shop.store.storeId, saturday);
  const closed = await shop.checkout();
  assert.equal(closed.response.status, 409);
  assert.equal((await errorOf(closed.response)).code, "day_closed");
  const past = await shop.checkout({ day: "2026-11-23" });
  assert.equal(past.response.status, 400);
  assert.equal((await errorOf(past.response)).code, "day_past");
  const todayOrder = await shop.checkout({ day: today });
  assert.equal(todayOrder.response.status, 201);
});

test("a day after the 21 days of the day picker is refused", async () => {
  const shop = orderApp();
  const last = await shop.checkout({ day: "2026-12-14" });
  assert.equal(last.response.status, 201);
  const far = await shop.checkout({ day: "2026-12-15" });
  assert.equal(far.response.status, 400);
  const error = await errorOf(far.response);
  assert.equal(error.code, "day_too_far");
  assert.match(error.message, /Monday, 14 December/);
});

test("via market makes a marketplace order, which may need an advance", async () => {
  const shop = orderApp({ acceptsOnline: true, advanceForStrangers: true });
  const market = await shop.checkout({ via: "market" });
  const link = await shop.checkout({ via: "qr" });
  assert.equal(market.response.status, 201);
  assert.equal(link.response.status, 201);
  assert.deepEqual(
    shop.deps.db
      .prepare(
        "SELECT source, status, payment_required FROM orders ORDER BY number",
      )
      .all(),
    [
      {
        source: "marketplace",
        status: "awaiting_payment",
        payment_required: 1,
      },
      { source: "link", status: "new", payment_required: 0 },
    ],
  );
});

test("a new price applies only to new orders", async () => {
  const shop = orderApp();
  const pak = shop.store.items.mysorePak.packs[2];
  const first = await shop.checkout();
  const { token } = checkoutAnswerSchema.parse(await first.response.json());
  shop.deps.db
    .prepare("UPDATE packs SET price = 90000 WHERE id = ?")
    .run(pak.id);
  const second = await shop.checkout({
    cart: [{ pack_id: pak.id, quantity: 1, price: 90000 }],
  });
  assert.equal(second.response.status, 201);
  const page = orderPageSchema.parse(
    await (await shop.app.request(`/api/orders/${token}`)).json(),
  );
  assert.equal(page.total, 88000);
  assert.equal(page.lines[0]?.price, 88000);
});

test("the order page of a pickup order shows her address, a map link and her chat link", async () => {
  const shop = orderApp();
  const { response } = await shop.checkout({ buyer_language: "hi" });
  const { token } = checkoutAnswerSchema.parse(await response.json());
  const page = await shop.app.request(`/api/orders/${token}`);
  assert.equal(page.status, 200);
  const text = await page.text();
  assert.doesNotMatch(text, /12\.9417|77\.5755/);
  const order = orderPageSchema.parse(JSON.parse(text));
  assert.equal(order.number, 1);
  assert.equal(order.day, saturday);
  assert.equal(order.fulfilment, "pickup");
  assert.deepEqual(
    order.lines.map((line) => [line.name, line.label]),
    [["Mysore pak", "1 kg"]],
  );
  assert.deepEqual(order.store.pickup, {
    address: "12, 4th Cross, Basavanagudi",
    map_url:
      "https://www.google.com/maps/search/?api=1&query=12%2C%204th%20Cross%2C%20Basavanagudi",
  });
  const chat = new URL(order.store.message_url);
  assert.equal(chat.pathname, `/${shop.store.phone.slice(1)}`);
  assert.match(chat.searchParams.get("text") ?? "", /ऑर्डर 1/);
  assert.equal(order.messages[0]?.language, "hi");
  assert.match(
    order.messages[0]?.body ?? "",
    new RegExp(`${publicUrl}/o/${token}`),
  );
});

test("the order page of a delivery order keeps her address private", async () => {
  const shop = orderApp();
  const { response } = await shop.checkout({
    fulfilment: "delivery",
    address: "4th Block, Jayanagar",
  });
  const { token } = checkoutAnswerSchema.parse(await response.json());
  const text = await (await shop.app.request(`/api/orders/${token}`)).text();
  assert.doesNotMatch(text, /4th Cross/);
  assert.doesNotMatch(text, /12\.9417/);
});

test("an unknown order link is not found, and reading a page writes nothing", async () => {
  const shop = orderApp();
  const { response } = await shop.checkout();
  const { token } = checkoutAnswerSchema.parse(await response.json());
  const count = () =>
    shop.deps.db
      .prepare(
        "SELECT (SELECT count(*) FROM orders) + (SELECT count(*) FROM messages) + (SELECT count(*) FROM sessions) + (SELECT count(*) FROM idempotency_keys)",
      )
      .pluck()
      .get();
  const before = count();
  assert.equal((await shop.app.request(`/api/orders/${token}`)).status, 200);
  assert.equal(count(), before);
  const unknown = await shop.app.request("/api/orders/no-such-order-token-000");
  assert.equal(unknown.status, 404);
  assert.equal((await errorOf(unknown)).code, "not_found");
});

test("the request logs hold no phone number and no address", async () => {
  const shop = orderApp();
  await shop.checkout({
    fulfilment: "delivery",
    address: "4th Block, Jayanagar",
    gift: { name: "Amma", phone: "98450 12345" },
  });
  const log = shop.lines.join("\n");
  assert.doesNotMatch(log, /98765|98450|Jayanagar/);
  assert.ok(shop.logs().some((line) => line.route === "/api/orders"));
});

test("the desk sees new orders only through the seller session or the demo token", async () => {
  const shop = orderApp();
  const response = await shop.app.request("/api/desk/events", {
    headers: { [demoTokenHeader]: "wrong-token-of-enough-length" },
  });
  assert.equal(response.status, 401);
});

test("a Hindi buyer gets the dish names in Devanagari, in her message and on her order page", async () => {
  const shop = orderApp();
  shop.deps.db
    .prepare("UPDATE items SET name = ?, name_latin = ? WHERE id = ?")
    .run("ಮೈಸೂರು ಪಾಕ್", "Mysore pak", shop.store.items.mysorePak.id);
  const { response } = await shop.checkout({ buyer_language: "hi" });
  assert.equal(response.status, 201);
  const answer = checkoutAnswerSchema.parse(await response.json());
  const placed = answer.order.messages[0]?.body ?? "";
  assert.match(placed, /^1 × मैसूर पाक · Mysore pak 1 kg$/m);
  assert.doesNotMatch(placed, /ಮೈಸೂರು/);
  const lineOf = async (query: string) => {
    const page = await shop.app.request(`/api/orders/${answer.token}${query}`);
    assert.equal(page.status, 200);
    return orderPageSchema.parse(await page.json()).lines[0];
  };
  assert.equal((await lineOf("?lang=hi"))?.name_script, "मैसूर पाक");
  assert.equal((await lineOf("?lang=en"))?.name_script, "Mysore pak");
  assert.equal((await lineOf(""))?.name_script, null);
  assert.equal((await lineOf("?lang=xx"))?.name_script, null);
  const english = await shop.checkout({ buyer_language: "en" });
  const body =
    checkoutAnswerSchema.parse(await english.response.json()).order.messages[0]
      ?.body ?? "";
  assert.match(body, /^1 × Mysore pak 1 kg$/m);
  assert.doesNotMatch(body, /ಮೈಸೂರು/);
});
