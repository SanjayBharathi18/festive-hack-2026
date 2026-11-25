import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { OrderSource } from "../../shared/model.ts";
import { openDatabase } from "../db/database.ts";
import { createTestClock } from "../test-app.ts";
import { seedStore } from "../test-store.ts";
import type { MessageOrder } from "./links.ts";
import { createMessenger, hasConsent } from "./sender.ts";

function setup() {
  const db = openDatabase(":memory:");
  const clock = createTestClock();
  const store = seedStore(db);
  const messenger = createMessenger({
    db,
    clock,
    publicUrl: "https://34-12-56-78.sslip.io",
  });
  const order = (source: OrderSource, buyerPhone: string | null) => {
    const id = randomUUID();
    const token = randomUUID().replaceAll("-", "");
    db.prepare(
      `INSERT INTO orders (id, store_id, number, token, source, status, fulfilment, day, total, created_at)
      VALUES (?, ?, (SELECT count(*) + 1 FROM orders), ?, ?, 'new', 'pickup', '2026-11-28', 45000, 0)`,
    ).run(id, store.storeId, token, source);
    const message: MessageOrder = {
      id,
      number: 1,
      token,
      source,
      buyerPhone,
      buyerLanguage: "kn",
      day: "2026-11-28",
      fulfilment: "pickup",
      total: 45000,
      cancelReason: null,
      lines: [
        {
          item_id: store.items.mysorePak.id,
          quantity: 1,
          name: "Mysore pak",
          name_latin: null,
          label: "500 g",
        },
      ],
      store: {
        name: "Shobha's Kitchen",
        address: "12, 4th Cross, Basavanagudi",
        sellerPhone: store.phone,
      },
    };
    return message;
  };
  return { db, clock, messenger, order };
}

test("a buyer who verified at checkout gets a simulated message in her language", () => {
  const { db, messenger, order, clock } = setup();
  const placed = order("link", "+919876543210");
  const sent = messenger.send(placed, "order_placed");
  assert.equal(sent?.language, "kn");
  assert.equal(sent?.channel, "simulated");
  assert.match(sent?.body ?? "", /ಆರ್ಡರ್/);
  assert.match(sent?.body ?? "", /12, 4th Cross, Basavanagudi/);
  assert.match(sent?.body ?? "", /: https:\/\/wa\.me\/919800000001\n/);
  assert.deepEqual(
    db
      .prepare("SELECT to_phone, template, language, channel FROM messages")
      .get(),
    {
      to_phone: "+919876543210",
      template: "order_placed",
      language: "kn",
      channel: "simulated",
    },
  );
  clock.advance(1000);
  messenger.send(placed, "order_ready");
  assert.deepEqual(
    messenger.log(placed.id).map((message) => message.template),
    ["order_placed", "order_ready"],
  );
});

test("each line names the dish in English, and in another language in its script first, then in English", () => {
  const { messenger, order } = setup();
  const placed = order("link", "+919876543210");
  const kannada = {
    ...placed,
    lines: placed.lines.map((line) => ({
      ...line,
      name: "ಮೈಸೂರು ಪಾಕ್",
      name_latin: "Mysore pak",
    })),
  };
  const [line] = kannada.lines;
  assert.ok(line !== undefined);
  const hindi = { ...kannada, buyerLanguage: "hi" as const };
  const names = new Map([[line.item_id, "मैसूर पाक"]]);
  assert.match(
    messenger.send(hindi, "order_placed", names)?.body ?? "",
    /^1 × मैसूर पाक · Mysore pak 500 g$/m,
  );
  assert.match(
    messenger.send(hindi, "order_changed")?.body ?? "",
    /^1 × Mysore pak 500 g$/m,
  );
  const english = { ...kannada, buyerLanguage: "en" as const };
  const changed = messenger.send(english, "order_changed")?.body ?? "";
  assert.match(changed, /^1 × Mysore pak 500 g$/m);
  assert.doesNotMatch(changed, /ಮೈಸೂರು/);
  assert.match(
    messenger.send(kannada, "order_changed")?.body ?? "",
    /^1 × ಮೈಸೂರು ಪಾಕ್ · Mysore pak 500 g$/m,
  );
});

test("a buyer with no language gets English", () => {
  const { messenger, order } = setup();
  const placed = {
    ...order("marketplace", "+919876543210"),
    buyerLanguage: null,
  };
  assert.equal(messenger.send(placed, "order_placed")?.language, "en");
});

test("buyers who gave no consent get no message", () => {
  const { db, messenger, order } = setup();
  for (const [source, phone] of [
    ["desk", "+919876543210"],
    ["load", "+919876543210"],
    ["desk", null],
    ["link", null],
  ] as const) {
    assert.equal(
      messenger.send(order(source, phone), "order_ready"),
      undefined,
    );
  }
  assert.equal(db.prepare("SELECT count(*) FROM messages").pluck().get(), 0);
});

test("consent comes from the code at checkout", () => {
  assert.equal(
    hasConsent({ source: "link", buyerPhone: "+919876543210" }),
    true,
  );
  assert.equal(
    hasConsent({ source: "marketplace", buyerPhone: "+919876543210" }),
    true,
  );
  assert.equal(
    hasConsent({ source: "desk", buyerPhone: "+919876543210" }),
    false,
  );
  assert.equal(hasConsent({ source: "link", buyerPhone: null }), false);
});
