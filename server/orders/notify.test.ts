import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutAnswerSchema } from "../../shared/orders.ts";
import { openDatabase } from "../db/database.ts";
import { createEventHub, type DeskEvent } from "../events/hub.ts";
import { createLog } from "../log.ts";
import { createMessenger } from "../messages/sender.ts";
import { createTestClock } from "../test-app.ts";
import { seedStore } from "../test-store.ts";
import { createNotify } from "./notify.ts";
import { createOrderData } from "./order-data.ts";
import { kiloLine, newOrder, orderApp, publicUrl } from "./test-orders.ts";

function setup() {
  const db = openDatabase(":memory:");
  const clock = createTestClock();
  const store = seedStore(db);
  const orders = createOrderData(db);
  const events = createEventHub();
  const seen: DeskEvent[] = [];
  events.subscribe(store.storeId, (event) => seen.push(event));
  const lines: string[] = [];
  const messenger = createMessenger({ db, clock, publicUrl });
  const notify = createNotify({
    messenger,
    events,
    log: createLog((line) => lines.push(line), clock),
    publicUrl,
  });
  const saved = (source: "link" | "desk") => {
    const order = newOrder(store, { source });
    orders.insert(order, [kiloLine(store)]);
    const record = orders.byId(store.storeId, order.id);
    assert.ok(record);
    return record;
  };
  return { db, notify, seen, lines, saved };
}

test("a new order goes to the desk of its store, with the message in its slip", () => {
  const { notify, seen, saved } = setup();
  const order = saved("link");
  const slip = notify.created(order, "order_placed");
  assert.deepEqual(
    slip.messages.map((message) => message.template),
    ["order_placed"],
  );
  assert.deepEqual(
    seen.map((event) => [event.type, "order" in event ? event.order.id : ""]),
    [["order_created", order.id]],
  );
});

test("a change goes to the desk, and a buyer with no consent gets no message", () => {
  const { db, notify, seen, saved } = setup();
  const order = saved("desk");
  notify.changed(order, "order_changed");
  assert.deepEqual(
    seen.map((event) => event.type),
    ["order_changed"],
  );
  assert.equal(db.prepare("SELECT count(*) FROM messages").pluck().get(), 0);
  assert.equal(notify.slip(order).id, order.id);
});

test("a message that cannot be saved is logged, and the event still goes out", () => {
  const { db, notify, seen, lines, saved } = setup();
  db.exec(
    "CREATE TRIGGER no_messages BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'disk full'); END",
  );
  const order = saved("link");
  const slip = notify.created(order, "order_placed");
  assert.deepEqual(slip.messages, []);
  assert.equal(seen.length, 1);
  const logged = lines.map(
    (line) => JSON.parse(line) as Record<string, unknown>,
  );
  assert.equal(logged[0]?.msg, "the simulated message was not saved");
  assert.equal(logged[0]?.order_id, order.id);
  assert.doesNotMatch(lines.join("\n"), /98765/);
});

test("a failed message write leaves the order saved", async () => {
  const shop = orderApp();
  shop.deps.db.exec(
    "CREATE TRIGGER no_messages BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'disk full'); END",
  );
  const { response } = await shop.checkout();
  assert.equal(response.status, 201);
  const { token, order } = checkoutAnswerSchema.parse(await response.json());
  assert.deepEqual(order.messages, []);
  assert.equal((await shop.app.request(`/api/orders/${token}`)).status, 200);
  assert.ok(
    shop
      .logs()
      .some((line) => line.msg === "the simulated message was not saved"),
  );
});

test("a message names the dishes in the buyer's script, with the names the translator knows", () => {
  const db = openDatabase(":memory:");
  const clock = createTestClock();
  const store = seedStore(db);
  db.prepare("UPDATE items SET name = ?, name_latin = ? WHERE id = ?").run(
    "ಮೈಸೂರು ಪಾಕ್",
    "Mysore pak",
    store.items.mysorePak.id,
  );
  const orders = createOrderData(db);
  const asked: string[] = [];
  const notify = createNotify({
    messenger: createMessenger({ db, clock, publicUrl }),
    events: createEventHub(),
    log: createLog(() => {}, clock),
    publicUrl,
    translator: {
      cached: () => null,
      knownNames: (items, to) => {
        asked.push(to);
        return new Map(items.map((item) => [item.id, "मैसूर पाक"]));
      },
    },
  });
  const saved = (overrides: Parameters<typeof newOrder>[1]) => {
    const order = newOrder(store, overrides);
    orders.insert(order, [kiloLine(store)]);
    const record = orders.byId(store.storeId, order.id);
    assert.ok(record);
    return record;
  };
  const hindi = notify.created(saved({ buyerLanguage: "hi" }), "order_placed");
  assert.match(
    hindi.messages[0]?.body ?? "",
    /^1 × मैसूर पाक · Mysore pak 1 kg$/m,
  );
  assert.doesNotMatch(hindi.messages[0]?.body ?? "", /ಮೈಸೂರು/);
  notify.created(saved({ source: "desk" }), "order_placed");
  assert.deepEqual(asked, ["hi"]);
});
