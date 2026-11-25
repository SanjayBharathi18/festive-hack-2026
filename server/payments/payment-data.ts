import { randomUUID } from "node:crypto";
import type { OrderStatus } from "../../shared/model.ts";
import type { OrderPayment } from "../../shared/orders.ts";
import { paymentHoldMs } from "../../shared/payments.ts";
import type { Db } from "../db/database.ts";

export type PaymentStatus = "started" | "paid" | "failed";

export type Payment = {
  id: string;
  order_id: string;
  provider: "mock" | "razorpay";
  status: PaymentStatus;
  amount: number;
  refunded: number;
  created_at: number;
  updated_at: number;
};

export type PaymentOrder = {
  id: string;
  storeId: string;
  status: OrderStatus;
  createdAt: number;
};

export type Payments = ReturnType<typeof createPayments>;

const latest = "ORDER BY created_at DESC, rowid DESC LIMIT 1";

// The payments of the orders (server/db/migrations/003-payments.sql). This
// build has the mock provider only.
export function createPayments(db: Db) {
  const open = db.prepare(
    `SELECT * FROM payments WHERE order_id = ? AND status = 'started' ${latest}`,
  );
  const paid = db.prepare(
    `SELECT * FROM payments WHERE order_id = ? AND status = 'paid' AND refunded = 0 ${latest}`,
  );
  const refunded = db
    .prepare("SELECT 1 FROM payments WHERE order_id = ? AND refunded > 0")
    .pluck();
  const insert = db.prepare(
    `INSERT INTO payments (id, order_id, provider, status, amount, created_at, updated_at)
    VALUES (?, ?, 'mock', 'started', ?, ?, ?)`,
  );
  const setAmount = db.prepare(
    "UPDATE payments SET amount = ?, updated_at = ? WHERE id = ?",
  );
  const setStatus = db.prepare(
    "UPDATE payments SET status = ?, updated_at = ? WHERE id = ?",
  );
  const setRefunded = db.prepare(
    "UPDATE payments SET refunded = amount, updated_at = ? WHERE id = ?",
  );
  const online = db
    .prepare("SELECT accepts_online FROM stores WHERE id = ?")
    .pluck();
  const byId = db.prepare("SELECT * FROM payments WHERE id = ?");

  const one = (id: string) => byId.get(id) as Payment;

  return {
    // The open payment of the order for its total now, or a new one. A retry
    // of Pay online reuses the payment that has not finished.
    start(orderId: string, amount: number, now: number): Payment {
      const found = open.get(orderId) as Payment | undefined;
      if (found === undefined) {
        const id = randomUUID();
        insert.run(id, orderId, amount, now, now);
        return one(id);
      }
      if (found.amount !== amount) setAmount.run(amount, now, found.id);
      return one(found.id);
    },
    settle(id: string, status: "paid" | "failed", now: number): void {
      setStatus.run(status, now, id);
    },
    paid: (orderId: string) => paid.get(orderId) as Payment | undefined,
    refund(id: string, now: number): void {
      setRefunded.run(now, id);
    },
    refunded: (orderId: string) => refunded.get(orderId) !== undefined,
    view(order: PaymentOrder): OrderPayment {
      return {
        online: online.get(order.storeId) === 1,
        refunded: refunded.get(order.id) !== undefined,
        pay_by: payBy(order),
      };
    },
  };
}

export function payBy(
  order: Pick<PaymentOrder, "status" | "createdAt">,
): number | null {
  return order.status === "awaiting_payment"
    ? order.createdAt + paymentHoldMs
    : null;
}
