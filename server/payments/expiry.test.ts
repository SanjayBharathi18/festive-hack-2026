import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentHoldMs } from "../../shared/payments.ts";
import { openDatabase } from "../db/database.ts";
import { createOrderData } from "../orders/order-data.ts";
import { kiloLine, newOrder } from "../orders/test-orders.ts";
import { seedStore } from "../test-store.ts";
import { createSweep, expireUnpaid, startPaymentExpiry } from "./expiry.ts";
import { createPayments, payBy } from "./payment-data.ts";

function setup() {
  const db = openDatabase(":memory:");
  const store = seedStore(db);
  const orders = createOrderData(db);
  const add = (status: "awaiting_payment" | "new", createdAt: number) => {
    const order = newOrder(store, { status, createdAt });
    orders.insert(order, [kiloLine(store)]);
    return order.id;
  };
  return { db, store, orders, add };
}

test("an order that waits for its payment expires after 15 minutes", () => {
  const { db, store, orders, add } = setup();
  const due = add("awaiting_payment", 0);
  const fresh = add("awaiting_payment", 1);
  const placed = add("new", 0);
  assert.deepEqual(expireUnpaid(db, paymentHoldMs - 1), []);
  assert.deepEqual(expireUnpaid(db, paymentHoldMs), [
    { id: due, store_id: store.storeId },
  ]);
  assert.equal(orders.byId(store.storeId, due)?.status, "expired");
  assert.equal(orders.byId(store.storeId, fresh)?.status, "awaiting_payment");
  assert.equal(orders.byId(store.storeId, placed)?.status, "new");
  assert.deepEqual(expireUnpaid(db, paymentHoldMs), []);
});

test("the sweep tells the desk of each expired order, and logs a failure instead of throwing", () => {
  const { db, orders, add } = setup();
  const id = add("awaiting_payment", 0);
  const changed: string[] = [];
  const lines: Record<string, unknown>[] = [];
  const sweep = createSweep({
    db,
    clock: { now: () => paymentHoldMs },
    orders,
    notify: {
      changed: (order) => {
        changed.push(order.id);
        return undefined as never;
      },
    },
    log: (fields) => lines.push(fields),
  });
  sweep();
  assert.deepEqual(changed, [id]);
  db.close();
  sweep();
  assert.equal(lines[0]?.msg, "the payment expiry failed");
});

test("the sweep runs on a timer until the server stops", async () => {
  const stopping = new AbortController();
  let runs = 0;
  startPaymentExpiry({
    stopping: stopping.signal,
    sweep: () => runs++,
    everyMs: 5,
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  stopping.abort();
  const seen = runs;
  assert.ok(seen > 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(runs, seen);
});

test("a retry of Pay online reuses the open payment, with the total of now", () => {
  const { db, add } = setup();
  const payments = createPayments(db);
  const id = add("new", 0);
  const first = payments.start(id, 88000, 1);
  const again = payments.start(id, 90000, 2);
  assert.equal(again.id, first.id);
  assert.equal(again.amount, 90000);
  payments.settle(first.id, "failed", 3);
  assert.notEqual(payments.start(id, 90000, 4).id, first.id);
});

test("pay_by is the end of the hold of an order that waits for its payment", () => {
  assert.equal(
    payBy({ status: "awaiting_payment", createdAt: 10 }),
    10 + paymentHoldMs,
  );
  assert.equal(payBy({ status: "new", createdAt: 10 }), null);
});

test("an order that she marked paid on her desk does not expire", () => {
  const { db, store, orders, add } = setup();
  const paidInCash = add("awaiting_payment", 0);
  orders.setPaid(paidInCash, true);
  assert.deepEqual(expireUnpaid(db, paymentHoldMs), []);
  assert.equal(
    orders.byId(store.storeId, paidInCash)?.status,
    "awaiting_payment",
  );
});
