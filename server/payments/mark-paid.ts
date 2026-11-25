import type { TemplateName } from "../messages/templates.ts";
import type { OrderData, OrderRecord } from "../orders/order-data.ts";

// Pay and the desk's "paid" mark the order paid in the same way. An order
// that waits for its payment is placed: it becomes new, so it keeps its space
// on the day, and it gives the "order placed" message to send after the
// transaction.
export function markPaid(
  orders: Pick<OrderData, "setPaid" | "setStatus">,
  order: Pick<OrderRecord, "id" | "status">,
): TemplateName | null {
  orders.setPaid(order.id, true);
  if (order.status !== "awaiting_payment") return null;
  orders.setStatus(order.id, "new", null);
  return "order_placed";
}
