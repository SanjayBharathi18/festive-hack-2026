import type {
  Fulfilment,
  OrderSource,
  OrderStatus,
} from "../../shared/model.ts";
import { stampSchema, type Stamp } from "../../shared/orders.ts";

// The same order as server/orders/stamps.ts, so that a slip shows its next
// stamp at once, before the server answers.
export function nextStamp(
  status: OrderStatus,
  fulfilment: Fulfilment,
): Stamp | null {
  switch (status) {
    case "new":
      return "making";
    case "making":
      return "ready";
    case "ready":
      return fulfilment === "pickup" ? "picked_up" : "delivered";
    default:
      return null;
  }
}

export function isStamp(status: OrderStatus): status is Stamp {
  return stampSchema.safeParse(status).success;
}

export function isOpen(status: OrderStatus): boolean {
  return (
    status === "awaiting_payment" ||
    status === "new" ||
    status === "making" ||
    status === "ready"
  );
}

// Kumkum still needs her; leaf is finished.
export function stampKind(status: Stamp): "needs" | "done" {
  return status === "new" || status === "making" ? "needs" : "done";
}

// NEW comes from the system, so it is straight. Every later status is a
// stamp of her hand.
export function byHand(status: Stamp): boolean {
  return status !== "new";
}

// Her hand tilts by 3°, to the side that the order id gives, so that a slip
// keeps its angle across reloads and phones.
export function tiltOf(id: string): "3deg" | "-3deg" {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return sum % 2 === 0 ? "-3deg" : "3deg";
}

// She stamps PAID by hand for cash, and on each order that she added
// herself; an online payment stamps it for her.
export function paidByHand(
  slip: { source: OrderSource },
  stampedHere: boolean,
): boolean {
  return stampedHere || slip.source === "desk" || slip.source === "load";
}
