import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  checkoutAnswerSchema,
  deskBoardSchema,
  deskOrderAnswerSchema,
  orderPageSchema,
} from "../../shared/orders.ts";
import {
  paymentHoldMs,
  paymentResultAnswerSchema,
  paymentStartAnswerSchema,
} from "../../shared/payments.ts";
import { daysResponseSchema } from "../../shared/store.ts";
import type { StoreOptions } from "../test-store.ts";
import { orderApp, saturday } from "../orders/test-orders.ts";
import { postJson } from "../verify/test-sign-in.ts";

type Code = { error: { code: string } };

async function setup(storeOptions: StoreOptions = {}, via?: string) {
  const test = orderApp(storeOptions);
  const placed = await test.checkout(via === undefined ? {} : { via });
  assert.equal(
    placed.response.status,
    201,
    await placed.response.clone().text(),
  );
  const { token, order } = checkoutAnswerSchema.parse(
    await placed.response.json(),
  );
  const id = test.deps.db
    .prepare("SELECT id FROM orders WHERE token = ?")
    .pluck()
    .get(token) as string;
  const start = (key: string = randomUUID()) =>
    postJson(
      test.app,
      `/api/payments/${token}/start`,
      {},
      {
        "Idempotency-Key": key,
      },
    );
  const mock = (result: string) =>
    postJson(test.app, `/api/payments/mock/${token}/${result}`, {});
  const page = async () =>
    orderPageSchema.parse(
      await (await test.app.request(`/api/orders/${token}`)).json(),
    );
  const refund = () =>
    test.desk(`/api/desk/orders/${id}/refund`, { method: "POST" });
  const payments = () =>
    test.deps.db
      .prepare(
        "SELECT status, amount, refunded FROM payments WHERE order_id = ? ORDER BY rowid",
      )
      .all(id);
  const days = async () => {
    const response = await postJson(test.app, "/api/days", {
      store_id: test.store.storeId,
      cart: [{ pack_id: test.store.items.mysorePak.packs[2].id, quantity: 1 }],
    });
    const answer = daysResponseSchema.parse(await response.json());
    return answer.days.find(({ day }) => day === saturday)?.fits;
  };
  return {
    ...test,
    token,
    id,
    order,
    start,
    mock,
    page,
    refund,
    payments,
    days,
  };
}

test("a required advance makes the order wait for its payment, and Pay places it", async () => {
  const { order, start, mock, clock } = await setup(
    { advanceForStrangers: true },
    "market",
  );
  assert.equal(order.status, "awaiting_payment");
  assert.equal(order.payment_required, true);
  assert.deepEqual(order.payment, {
    online: true,
    refunded: false,
    pay_by: clock.now() + paymentHoldMs,
  });
  assert.deepEqual(order.messages, []);

  const started = await start();
  assert.equal(started.status, 201);
  const answer = paymentStartAnswerSchema.parse(await started.json());
  assert.equal(answer.paid, false);
  assert.equal(answer.amount, 88000);
  assert.match(answer.pay_url ?? "", /^\/pay\/[\w-]{16,}$/);

  const paid = await mock("pay");
  assert.equal(paid.status, 200);
  const result = paymentResultAnswerSchema.parse(await paid.json());
  assert.equal(result.result, "paid");
  assert.equal(result.order.status, "new");
  assert.equal(result.order.paid, true);
  assert.equal(result.order.payment.pay_by, null);
  assert.deepEqual(
    result.order.messages.map(({ template }) => template),
    ["order_placed"],
  );
});

test("a link buyer of the same store pays nothing first", async () => {
  const { order } = await setup({ advanceForStrangers: true });
  assert.equal(order.status, "new");
  assert.equal(order.payment_required, false);
});

test("a failed optional payment leaves the order placed and unpaid, and a new try can pay", async () => {
  const { order, start, mock, page, payments } = await setup();
  assert.equal(order.status, "new");
  assert.equal(order.payment.online, true);
  assert.equal((await start()).status, 201);
  const failed = paymentResultAnswerSchema.parse(
    await (await mock("fail")).json(),
  );
  assert.equal(failed.result, "failed");
  assert.equal(failed.order.status, "new");
  assert.equal(failed.order.paid, false);

  assert.equal((await start()).status, 201);
  const paid = paymentResultAnswerSchema.parse(
    await (await mock("pay")).json(),
  );
  assert.equal(paid.result, "paid");
  assert.equal((await page()).paid, true);
  assert.deepEqual(payments(), [
    { status: "failed", amount: 88000, refunded: 0 },
    { status: "paid", amount: 88000, refunded: 0 },
  ]);
  assert.deepEqual(
    (await page()).messages.map(({ template }) => template),
    ["order_placed"],
  );
});

test("a paid order starts no payment, and Pay again changes nothing", async () => {
  const { start, mock, payments } = await setup();
  await mock("pay");
  const again = await start();
  assert.equal(again.status, 200);
  assert.deepEqual(paymentStartAnswerSchema.parse(await again.json()), {
    paid: true,
    amount: 88000,
    pay_url: null,
  });
  const twice = paymentResultAnswerSchema.parse(
    await (await mock("fail")).json(),
  );
  assert.equal(twice.result, "paid");
  assert.equal(payments().length, 1);
});

test("a retried start with the same key makes one payment", async () => {
  const { start, payments } = await setup();
  const key = randomUUID();
  const first = await start(key);
  const second = await start(key);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.deepEqual(await first.json(), await second.json());
  assert.equal(payments().length, 1);
  assert.equal((await start()).status, 201);
  assert.equal(payments().length, 1);
});

test("after 15 minutes an unpaid required order expires, and its space goes back", async () => {
  const { clock, mock, page, days } = await setup(
    { advanceForStrangers: true, dailyLimit: 1000 },
    "market",
  );
  assert.equal(await days(), false);
  clock.advance(paymentHoldMs - 1);
  assert.equal((await page()).status, "awaiting_payment");
  clock.advance(1);
  const expired = await page();
  assert.equal(expired.status, "expired");
  assert.equal(expired.payment.pay_by, null);
  assert.equal(await days(), true);

  const late = await mock("pay");
  assert.equal(late.status, 409);
  assert.equal(((await late.json()) as Code).error.code, "order_closed");
});

test("paid on the desk places a waiting order as Pay does: it keeps its space, and the buyer gets the order placed message", async () => {
  const { id, deskPatch, clock, page, days } = await setup(
    { advanceForStrangers: true, dailyLimit: 1000 },
    "market",
  );
  const marked = await deskPatch(id, { action: "paid", paid: true });
  assert.equal(marked.status, 200, await marked.clone().text());
  assert.equal(
    deskOrderAnswerSchema.parse(await marked.json()).order.status,
    "new",
  );
  clock.advance(paymentHoldMs);
  const placed = await page();
  assert.equal(placed.status, "new");
  assert.equal(placed.paid, true);
  assert.equal(placed.payment.pay_by, null);
  assert.deepEqual(
    placed.messages.map(({ template }) => template),
    ["order_placed"],
  );
  assert.equal(await days(), false);
});

test("an order paid online is not marked unpaid on the desk: Refund gives the money back", async () => {
  const { id, mock, deskPatch, refund } = await setup();
  assert.equal((await mock("pay")).status, 200);
  const unpaid = await deskPatch(id, { action: "paid", paid: false });
  assert.equal(unpaid.status, 409);
  assert.equal(((await unpaid.json()) as Code).error.code, "use_refund");
  assert.equal((await refund()).status, 200);
  const again = await deskPatch(id, { action: "paid", paid: false });
  assert.equal(again.status, 200);
  assert.equal(
    deskOrderAnswerSchema.parse(await again.json()).order.paid,
    false,
  );
});

test("a store with no online payments has no Pay online", async () => {
  const { order, start, mock } = await setup({ acceptsOnline: false });
  assert.equal(order.payment.online, false);
  const refused = await start();
  assert.equal(refused.status, 403);
  assert.equal(((await refused.json()) as Code).error.code, "forbidden");
  assert.equal((await mock("pay")).status, 403);
});

test("a cancelled order cannot be paid, and a bad result or token is refused", async () => {
  const { app, id, deskPatch, start, mock } = await setup();
  assert.equal((await mock("maybe")).status, 400);
  const unknown = await postJson(
    app,
    "/api/payments/mock/no-such-token-0000/pay",
    {},
  );
  assert.equal(unknown.status, 404);
  assert.equal(
    (await deskPatch(id, { action: "cancel", reason: "other" })).status,
    200,
  );
  const refused = await start();
  assert.equal(refused.status, 409);
  assert.equal(((await refused.json()) as Code).error.code, "order_closed");
});

test("Refund gives back a paid order once, and the order page says so", async () => {
  const { id, deskPatch, mock, refund, page, payments } = await setup();
  await mock("pay");
  await deskPatch(id, { action: "cancel", reason: "item_ran_out" });
  const first = await refund();
  assert.equal(first.status, 200, await first.clone().text());
  const answer = deskOrderAnswerSchema.parse(await first.json());
  assert.equal(answer.order.paid, false);
  assert.equal(answer.order.refunded, true);
  assert.deepEqual(answer.order.refund, { amount: 88000, online: true });
  assert.equal(answer.order.status, "cancelled");
  assert.deepEqual(payments(), [
    { status: "paid", amount: 88000, refunded: 88000 },
  ]);
  const again = await refund();
  assert.equal(again.status, 200);
  assert.equal(
    deskOrderAnswerSchema.parse(await again.json()).order.paid,
    false,
  );
  const shown = await page();
  assert.equal(shown.paid, false);
  assert.equal(shown.payment.refunded, true);
});

test("after a reload, the desk board still shows which orders she refunded", async () => {
  const { id, desk, deskPatch, mock, refund } = await setup();
  const before = await setup();
  await mock("pay");
  await deskPatch(id, { action: "cancel", reason: "other" });
  await refund();
  const board = async (shop: { desk: typeof desk }) =>
    deskBoardSchema
      .parse(
        await (await shop.desk(`/api/desk/orders?from=${saturday}`)).json(),
      )
      .days.flatMap(({ slips }) => slips);
  assert.deepEqual(
    (await board({ desk })).map(({ id: slip, refunded }) => [slip, refunded]),
    [[id, true]],
  );
  assert.equal((await board(before))[0]?.refunded, false);
});

test("Refund marks a cash payment as given back, and refuses an unpaid order", async () => {
  const { id, deskPatch, refund, payments } = await setup();
  const unpaid = await refund();
  assert.equal(unpaid.status, 409);
  assert.equal(((await unpaid.json()) as Code).error.code, "forbidden");
  await deskPatch(id, { action: "paid", paid: true });
  const cash = await refund();
  assert.equal(cash.status, 200);
  assert.equal(
    deskOrderAnswerSchema.parse(await cash.json()).order.paid,
    false,
  );
  assert.deepEqual(payments(), []);
});

test("Refund needs the desk of the order's store", async () => {
  const { app, id } = await setup();
  const response = await app.request(`/api/desk/orders/${id}/refund`, {
    method: "POST",
  });
  assert.equal(response.status, 401);
  const other = await setup();
  const missing = await other.desk(`/api/desk/orders/${randomUUID()}/refund`, {
    method: "POST",
  });
  assert.equal(missing.status, 404);
});

test("a payment that went through is not taken twice when the desk marks the order unpaid, and it can still be refunded", async () => {
  const { start, mock, refund, payments, deps, id } = await setup();
  assert.equal((await start()).status, 201);
  assert.equal((await mock("pay")).status, 200);
  deps.db.prepare("UPDATE orders SET paid = 0 WHERE id = ?").run(id);

  const again = paymentStartAnswerSchema.parse(await (await start()).json());
  assert.equal(again.paid, true);
  assert.equal(again.pay_url, null);
  const paidAgain = paymentResultAnswerSchema.parse(
    await (await mock("pay")).json(),
  );
  assert.equal(paidAgain.result, "paid");
  assert.deepEqual(payments(), [
    { status: "paid", amount: 88000, refunded: 0 },
  ]);

  const refunded = await refund();
  assert.equal(refunded.status, 200, await refunded.clone().text());
  assert.deepEqual(payments(), [
    { status: "paid", amount: 88000, refunded: 88000 },
  ]);
  assert.equal((await refund()).status, 200);
  assert.deepEqual(payments(), [
    { status: "paid", amount: 88000, refunded: 88000 },
  ]);
});
