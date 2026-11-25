import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  checkoutAnswerSchema,
  deskBoardSchema,
  deskOrderAnswerSchema,
  orderPageSchema,
  undoWindowMs,
} from "../../shared/orders.ts";
import { deskBody, orderApp } from "./test-orders.ts";

type Shop = ReturnType<typeof orderApp>;

async function makingOrder(shop: Shop) {
  const placed = checkoutAnswerSchema.parse(
    await (await shop.checkout({ buyer_language: "en" })).response.json(),
  );
  const board = deskBoardSchema.parse(
    await (await shop.desk("/api/desk/orders")).json(),
  );
  const id = board.days[0]?.slips[0]?.id ?? "";
  const patch = async (body: Record<string, unknown>) => {
    const response = await shop.deskPatch(id, body);
    assert.equal(response.status, 200, await response.clone().text());
  };
  const stamp = (status: string) => patch({ action: "stamp", status });
  const templates = async () =>
    orderPageSchema
      .parse(
        await (await shop.app.request(`/api/orders/${placed.token}`)).json(),
      )
      .messages.map((message) => message.template);
  await stamp("making");
  return { stamp, patch, templates };
}

function mockTimers(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  return (ms: number) => t.mock.timers.tick(ms);
}

test("the undo window is 10 seconds", () => {
  assert.equal(undoWindowMs, 10_000);
});

test("the READY message waits for the undo window, then goes out once", async (t) => {
  const tick = mockTimers(t);
  const { stamp, templates } = await makingOrder(orderApp());
  await stamp("ready");
  assert.deepEqual(await templates(), ["order_placed"]);
  tick(undoWindowMs - 1);
  assert.deepEqual(await templates(), ["order_placed"]);
  tick(1);
  assert.deepEqual(await templates(), ["order_placed", "order_ready"]);
  await stamp("making");
  await stamp("ready");
  tick(undoWindowMs);
  assert.deepEqual(await templates(), ["order_placed", "order_ready"]);
});

test("an undo within the window takes the READY message back", async (t) => {
  const tick = mockTimers(t);
  const { stamp, templates } = await makingOrder(orderApp());
  await stamp("ready");
  tick(undoWindowMs / 2);
  await stamp("making");
  tick(undoWindowMs);
  assert.deepEqual(await templates(), ["order_placed"]);
});

test("an order that moves on within the window gets no READY message", async (t) => {
  const tick = mockTimers(t);
  const { stamp, templates } = await makingOrder(orderApp());
  await stamp("ready");
  await stamp("picked_up");
  tick(undoWindowMs);
  assert.deepEqual(await templates(), ["order_placed"]);
});

test("a cancel within the window sends only the cancel message", async (t) => {
  const tick = mockTimers(t);
  const { stamp, patch, templates } = await makingOrder(orderApp());
  await stamp("ready");
  await patch({ action: "cancel", reason: "other" });
  tick(undoWindowMs);
  assert.deepEqual(await templates(), ["order_placed", "order_cancelled"]);
});

test("a READY message that waits when the server stops goes out at once", async (t) => {
  mockTimers(t);
  const stop = new AbortController();
  const { stamp, templates } = await makingOrder(
    orderApp({}, { stopping: stop.signal }),
  );
  await stamp("ready");
  stop.abort();
  assert.deepEqual(await templates(), ["order_placed", "order_ready"]);
});

test("a READY stamp while the server stops is sent at once", async (t) => {
  mockTimers(t);
  const stop = new AbortController();
  const { stamp, templates } = await makingOrder(
    orderApp({}, { stopping: stop.signal }),
  );
  stop.abort();
  await stamp("ready");
  assert.deepEqual(await templates(), ["order_placed", "order_ready"]);
});

test("a desk order gets no READY message, because the buyer gave no consent", async (t) => {
  const tick = mockTimers(t);
  const shop = orderApp();
  const { order } = deskOrderAnswerSchema.parse(
    await (
      await shop.deskPost(deskBody(shop.store, { buyer_phone: "98450 12345" }))
    ).json(),
  );
  for (const status of ["making", "ready"]) {
    await shop.deskPatch(order.id, { action: "stamp", status });
  }
  tick(undoWindowMs);
  assert.equal(
    shop.deps.db.prepare("SELECT count(*) FROM messages").pluck().get(),
    0,
  );
});
