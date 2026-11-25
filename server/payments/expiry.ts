import { paymentHoldMs } from "../../shared/payments.ts";
import type { Clock } from "../clock.ts";
import type { Db } from "../db/database.ts";
import type { Log } from "../log.ts";
import type { Notify } from "../orders/notify.ts";
import type { OrderData } from "../orders/order-data.ts";

export type Expired = { id: string; store_id: string };

export const sweepEveryMs = 30_000;

// Expires the orders that are due, and tells the desk of each one. It never
// throws, because the timer runs it too.
export function createSweep({
  db,
  clock,
  orders,
  notify,
  log,
}: {
  db: Db;
  clock: Clock;
  orders: Pick<OrderData, "byId">;
  notify: Pick<Notify, "changed">;
  log: Log;
}): () => void {
  return () => {
    try {
      for (const { id, store_id } of expireUnpaid(db, clock.now())) {
        const order = orders.byId(store_id, id);
        if (order !== undefined) notify.changed(order, null);
      }
    } catch (error) {
      log({ msg: "the payment expiry failed", error: String(error) });
    }
  };
}

// An order that waits for its required payment expires after 15 minutes,
// and its space on the day goes back (capacity counts no expired order).
// An order that she marked paid on her desk keeps its space.
export function expireUnpaid(db: Db, now: number): Expired[] {
  return db
    .prepare(
      `UPDATE orders SET status = 'expired'
      WHERE status = 'awaiting_payment' AND paid = 0 AND created_at <= ?
      RETURNING id, store_id`,
    )
    .all(now - paymentHoldMs) as Expired[];
}

// The sweep runs every 30 s, and the payment and order routes also run it
// before they read an order, so a late sweep never shows an old status.
export function startPaymentExpiry({
  stopping,
  sweep,
  everyMs = sweepEveryMs,
}: {
  stopping: AbortSignal;
  sweep: () => void;
  everyMs?: number;
}): void {
  if (stopping.aborted) return;
  const timer = setInterval(sweep, everyMs);
  timer.unref();
  stopping.addEventListener("abort", () => clearInterval(timer), {
    once: true,
  });
}
