import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrderStatus } from "../../shared/model.ts";
import { markPaid } from "./mark-paid.ts";

function fakeOrders(status: OrderStatus) {
  const order = { id: "order-1", status, paid: false };
  return {
    order,
    orders: {
      setPaid: (_id: string, paid: boolean) => void (order.paid = paid),
      setStatus: (_id: string, next: OrderStatus) => void (order.status = next),
    },
  };
}

test("a waiting order is placed: it becomes new and gives the order placed message", () => {
  const { order, orders } = fakeOrders("awaiting_payment");
  assert.equal(markPaid(orders, { ...order }), "order_placed");
  assert.deepEqual(order, { id: "order-1", status: "new", paid: true });
});

test("a placed order only becomes paid, with no message", () => {
  const { order, orders } = fakeOrders("ready");
  assert.equal(markPaid(orders, { ...order }), null);
  assert.deepEqual(order, { id: "order-1", status: "ready", paid: true });
});
