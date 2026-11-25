import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentHoldMs } from "../../shared/payments.ts";
import { addsLoad } from "../capacity/capacity.ts";
import { openDatabase } from "../db/database.ts";
import { isAppError, type AppError } from "../http/errors.ts";
import { expireUnpaid } from "../payments/expiry.ts";
import { createPayments } from "../payments/payment-data.ts";
import { publishedStoreById } from "../stores/store-data.ts";
import { createTestClock } from "../test-app.ts";
import { seedStore } from "../test-store.ts";
import { createOrderData, type NewOrder } from "./order-data.ts";
import { createOrderPatch, sameOrder, type Patch } from "./order-patch.ts";
import { kiloLine, newOrder, saturday, sunday } from "./test-orders.ts";

function setup(overrides: Partial<NewOrder> = {}) {
  const db = openDatabase(":memory:");
  const clock = createTestClock();
  const seeded = seedStore(db);
  const store = publishedStoreById(db, seeded.storeId);
  assert.ok(store);
  const orders = createOrderData(db);
  const patchOrder = createOrderPatch({ db, clock, orders });
  const order = newOrder(seeded, overrides);
  orders.insert(order, [kiloLine(seeded)]);
  const current = () => {
    const saved = orders.byId(store.id, order.id);
    assert.ok(saved);
    return saved;
  };
  const apply = (patch: Patch) => patchOrder(store, current(), patch);
  return { seeded, current, apply, db, clock };
}

function refusedWith(code: string) {
  return (error: unknown) => isAppError(error) && error.code === code;
}

const edit = (
  seeded: ReturnType<typeof seedStore>,
  changes: Partial<Extract<Patch, { action: "edit" }>> = {},
): Patch => ({
  action: "edit",
  day: saturday,
  fulfilment: "pickup",
  address: null,
  note: null,
  buyer_name: "Priya",
  buyer_phone: "+919876543210",
  cart: [{ pack_id: seeded.items.mysorePak.packs[2].id, quantity: 1 }],
  ...changes,
});

test("a stamp moves one step and sends no message itself", () => {
  const { apply, current } = setup();
  assert.deepEqual(apply({ action: "stamp", status: "making" }), {
    changed: true,
    template: null,
    warning: null,
  });
  assert.equal(current().status, "making");
  assert.equal(apply({ action: "stamp", status: "making" }).changed, false);
});

test("a stamp that skips a step is refused, with the next stamp", () => {
  const { apply } = setup();
  assert.throws(
    () => apply({ action: "stamp", status: "picked_up" }),
    (error) =>
      refusedWith("stamp_not_allowed")(error) &&
      /next stamp is making/.test((error as Error).message),
  );
});

test("paid changes only when it differs", () => {
  const { apply, current } = setup();
  assert.equal(apply({ action: "paid", paid: false }).changed, false);
  assert.equal(apply({ action: "paid", paid: true }).changed, true);
  assert.equal(current().paid, true);
});

test("paid by hand places a waiting order as Pay does, and it keeps its space", () => {
  const { apply, current, db, clock } = setup({
    status: "awaiting_payment",
    paymentRequired: true,
    createdAt: Date.UTC(2026, 10, 24),
  });
  assert.deepEqual(apply({ action: "paid", paid: true }), {
    changed: true,
    template: "order_placed",
    warning: null,
  });
  assert.equal(current().status, "new");
  assert.equal(current().paid, true);
  assert.deepEqual(expireUnpaid(db, clock.now() + paymentHoldMs), []);
  assert.ok(addsLoad(current().status));
});

test("an order paid online is not marked unpaid until Refund gives it back", () => {
  const { apply, current, db, clock } = setup();
  const payments = createPayments(db);
  const payment = payments.start(current().id, 88000, clock.now());
  payments.settle(payment.id, "paid", clock.now());
  assert.equal(apply({ action: "paid", paid: true }).template, null);
  assert.throws(
    () => apply({ action: "paid", paid: false }),
    (error) =>
      refusedWith("use_refund")(error) && (error as AppError).status === 409,
  );
  assert.equal(current().paid, true);
  payments.refund(payment.id, clock.now());
  assert.equal(apply({ action: "paid", paid: false }).changed, true);
  assert.equal(current().paid, false);
});

test("a cancel keeps her reason and sends the cancel message once", () => {
  const { apply, current, seeded } = setup();
  assert.deepEqual(apply({ action: "cancel", reason: "cant_deliver" }), {
    changed: true,
    template: "order_cancelled",
    warning: null,
  });
  assert.equal(current().cancelReason, "cant_deliver");
  assert.equal(
    apply({ action: "cancel", reason: "cant_deliver" }).changed,
    false,
  );
  assert.throws(
    () => apply({ action: "cancel", reason: "other" }),
    refusedWith("order_closed"),
  );
  assert.throws(() => apply(edit(seeded)), refusedWith("order_closed"));
});

test("an edit with no difference changes nothing, but still checks the day", () => {
  const { apply, seeded } = setup();
  assert.deepEqual(apply(edit(seeded)), {
    changed: false,
    template: null,
    warning: null,
  });
  const big = apply(
    edit(seeded, {
      cart: [{ pack_id: seeded.items.mysorePak.packs[2].id, quantity: 26 }],
    }),
  );
  assert.equal(big.changed, true);
  assert.equal(big.template, "order_changed");
  assert.equal(big.warning?.reason, "not_enough_space");
});

test("an edit keeps the verified number of a checkout order", () => {
  const checkout = setup({ source: "link" });
  checkout.apply(edit(checkout.seeded, { buyer_phone: "+919999999999" }));
  assert.equal(checkout.current().buyerPhone, "+919876543210");
  const desk = setup({ source: "desk" });
  desk.apply(edit(desk.seeded, { buyer_phone: "+919999999999" }));
  assert.equal(desk.current().buyerPhone, "+919999999999");
});

test("an edit may not move an order to a past day, but an old order can still change", () => {
  const recent = setup();
  assert.throws(
    () => recent.apply(edit(recent.seeded, { day: "2026-11-23" })),
    refusedWith("day_past"),
  );
  const old = setup({ day: "2026-11-23", status: "ready" });
  const changed = old.apply(
    edit(old.seeded, { day: "2026-11-23", note: "at the gate" }),
  );
  assert.equal(changed.changed, true);
  assert.equal(old.current().note, "at the gate");
  assert.equal(old.apply(edit(old.seeded, { day: sunday })).changed, true);
});

test("sameOrder compares the fields and the packs", () => {
  const { current, seeded } = setup();
  const order = current();
  const fields = {
    fulfilment: order.fulfilment,
    day: order.day,
    address: order.address,
    note: order.note,
    buyerName: order.buyerName,
    buyerPhone: order.buyerPhone,
    total: order.total,
  };
  assert.equal(sameOrder(order, fields, order.lines), true);
  assert.equal(sameOrder(order, { ...fields, note: "x" }, order.lines), false);
  assert.equal(sameOrder(order, fields, [kiloLine(seeded, 2)]), false);
});
