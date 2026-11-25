import type { Fulfilment, OrderStatus } from "../../shared/model.ts";
import type { Stamp } from "../../shared/orders.ts";

const previous: Partial<Record<OrderStatus, Stamp>> = {
  making: "new",
  ready: "making",
  delivered: "ready",
  picked_up: "ready",
};

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

export function previousStamp(status: OrderStatus): Stamp | null {
  return previous[status] ?? null;
}

export function canStamp(
  status: OrderStatus,
  fulfilment: Fulfilment,
  target: Stamp,
): boolean {
  return (
    target === status ||
    target === nextStamp(status, fulfilment) ||
    target === previousStamp(status)
  );
}

export function isOpen(status: OrderStatus): boolean {
  return (
    status === "awaiting_payment" ||
    status === "new" ||
    status === "making" ||
    status === "ready"
  );
}
