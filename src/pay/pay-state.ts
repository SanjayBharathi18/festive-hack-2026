import type { OrderPage } from "../../shared/orders.ts";

export type PayState =
  | { kind: "payable"; payBy: number | null }
  | { kind: "paid" }
  | { kind: "expired" }
  | { kind: "cancelled" }
  | { kind: "offline" };

// What the prototype payment screen can do for this order. A required
// payment is due by its pay_by time; after it, the order expires.
export function payState(
  order: Pick<OrderPage, "status" | "paid" | "payment">,
  now: number,
): PayState {
  if (order.paid) return { kind: "paid" };
  if (order.status === "cancelled") return { kind: "cancelled" };
  const payBy = order.payment.pay_by;
  if (order.status === "expired" || (payBy !== null && now >= payBy)) {
    return { kind: "expired" };
  }
  if (!order.payment.online) return { kind: "offline" };
  return { kind: "payable", payBy };
}

// The words after a failed payment: a required payment leaves the order
// unplaced, an optional one leaves it placed and unpaid.
export function failedLine(
  order: Pick<OrderPage, "status">,
): "failed_waiting" | "failed_placed" {
  return order.status === "awaiting_payment"
    ? "failed_waiting"
    : "failed_placed";
}
