import type { z } from "zod";
import { istDay } from "../../shared/day.ts";
import type {
  DayWarning,
  deskOrderPatchSchema,
  OrderLine,
} from "../../shared/orders.ts";
import type { Clock } from "../clock.ts";
import type { Db } from "../db/database.ts";
import { appError, type AppError } from "../http/errors.ts";
import type { TemplateName } from "../messages/templates.ts";
import { markPaid } from "../payments/mark-paid.ts";
import { createPayments } from "../payments/payment-data.ts";
import { getMenu } from "../stores/menu.ts";
import type { Store } from "../stores/store-data.ts";
import { keptOffers, priceCart } from "./cart.ts";
import { sellerDaySpace } from "./day-space.ts";
import type { OrderData, OrderFields, OrderRecord } from "./order-data.ts";
import { cartError, pastDayError } from "./order-errors.ts";
import { canStamp, isOpen, nextStamp } from "./stamps.ts";

export type Patch = z.output<typeof deskOrderPatchSchema>;
type Edit = Extract<Patch, { action: "edit" }>;

export type Change = {
  changed: boolean;
  template: TemplateName | null;
  warning: DayWarning | null;
};

const unchanged: Change = { changed: false, template: null, warning: null };

export function createOrderPatch({
  db,
  clock,
  orders,
}: {
  db: Db;
  clock: Clock;
  orders: OrderData;
}) {
  const payments = createPayments(db);
  const edit = (store: Store, order: OrderRecord, patch: Edit): Change => {
    if (!isOpen(order.status)) throw closedError(order);
    if (patch.day !== order.day && patch.day < istDay(clock.now())) {
      throw pastDayError();
    }
    const priced = priceCart(
      keptOffers(getMenu(db, store.id), order.lines),
      patch.cart,
      { checkPrices: false, allowSoldOut: true },
    );
    if (!priced.ok) throw cartError(priced.problem);
    const fields: OrderFields = {
      fulfilment: patch.fulfilment,
      day: patch.day,
      address: patch.fulfilment === "delivery" ? patch.address : null,
      note: patch.note,
      buyerName: patch.buyer_name,
      buyerPhone:
        order.source === "desk" || order.source === "load"
          ? patch.buyer_phone
          : order.buyerPhone,
      total: priced.total,
    };
    const warning = sellerDaySpace(
      db,
      store,
      patch.day,
      priced.lines,
      order.id,
    );
    if (sameOrder(order, fields, priced.lines)) {
      return { ...unchanged, warning };
    }
    orders.edit(order.id, fields, priced.lines);
    return { changed: true, template: "order_changed", warning };
  };

  return (store: Store, order: OrderRecord, patch: Patch): Change => {
    switch (patch.action) {
      case "stamp": {
        if (!canStamp(order.status, order.fulfilment, patch.status)) {
          throw stampError(order);
        }
        if (patch.status === order.status) return unchanged;
        orders.setStatus(order.id, patch.status, null);
        return { changed: true, template: null, warning: null };
      }
      case "paid": {
        if (patch.paid === order.paid) return unchanged;
        if (patch.paid) {
          const template = markPaid(orders, order);
          return { changed: true, template, warning: null };
        }
        if (payments.paid(order.id) !== undefined) throw paidOnlineError();
        orders.setPaid(order.id, false);
        return { changed: true, template: null, warning: null };
      }
      case "cancel":
        if (
          order.status === "cancelled" &&
          order.cancelReason === patch.reason
        ) {
          return unchanged;
        }
        if (!isOpen(order.status)) throw closedError(order);
        orders.setStatus(order.id, "cancelled", patch.reason);
        return { changed: true, template: "order_cancelled", warning: null };
      case "edit":
        return edit(store, order, patch);
    }
  };
}

export function sameOrder(
  order: Pick<
    OrderRecord,
    | "fulfilment"
    | "day"
    | "address"
    | "note"
    | "buyerName"
    | "buyerPhone"
    | "total"
    | "lines"
  >,
  fields: OrderFields,
  lines: readonly Pick<OrderLine, "pack_id" | "quantity" | "price">[],
): boolean {
  const before: OrderFields = {
    fulfilment: order.fulfilment,
    day: order.day,
    address: order.address,
    note: order.note,
    buyerName: order.buyerName,
    buyerPhone: order.buyerPhone,
    total: order.total,
  };
  const packs = (list: typeof lines) =>
    list.map(({ pack_id, quantity, price }) => ({ pack_id, quantity, price }));
  return (
    JSON.stringify([before, packs(order.lines)]) ===
    JSON.stringify([fields, packs(lines)])
  );
}

function stampError(order: OrderRecord): AppError {
  const next = nextStamp(order.status, order.fulfilment);
  return appError(
    409,
    "stamp_not_allowed",
    `This order is ${words(order.status)}. ${next === null ? "It takes no more stamps." : `Its next stamp is ${words(next)}.`}`,
  );
}

function paidOnlineError(): AppError {
  return appError(
    409,
    "use_refund",
    "This order was paid online, so it stays paid. Use Refund to give the money back.",
  );
}

function closedError(order: OrderRecord): AppError {
  return appError(
    409,
    "order_closed",
    `This order is ${words(order.status)}, so it cannot change. Add a new order instead.`,
  );
}

function words(status: string): string {
  return status.replace("_", " ");
}
