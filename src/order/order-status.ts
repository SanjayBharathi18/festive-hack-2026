import type { Day } from "../../shared/day.ts";
import { istDay } from "../../shared/day.ts";
import type { AppLanguage } from "../../shared/languages.ts";
import type { Fulfilment, OrderStatus } from "../../shared/model.ts";
import type { OrderPage } from "../../shared/orders.ts";

export type StatusStamp = {
  status: OrderStatus;
  kind: "need" | "done";
  hand: boolean;
};

// The stamps of the slip. Kumkum while she still has work to do, leaf when it
// is finished. Her own stamps tilt; the system's stamps stay straight.
export function statusStamp(status: OrderStatus): StatusStamp {
  switch (status) {
    case "awaiting_payment":
    case "new":
    case "expired":
      return { status, kind: "need", hand: false };
    case "making":
    case "cancelled":
      return { status, kind: "need", hand: true };
    case "ready":
    case "delivered":
    case "picked_up":
      return { status, kind: "done", hand: true };
  }
}

export type StatusLine =
  | "awaiting_payment"
  | "new"
  | "making"
  | "ready_pickup"
  | "ready_delivery"
  | "delivered"
  | "picked_up"
  | "cancelled"
  | "expired";

export function statusLine(
  status: OrderStatus,
  fulfilment: Fulfilment,
): StatusLine {
  if (status === "ready") {
    return fulfilment === "pickup" ? "ready_pickup" : "ready_delivery";
  }
  return status;
}

// One angle for each order, so the stamps of one slip lean the same way.
export function tiltOf(number: number): string {
  return number % 2 === 0 ? "-3deg" : "3deg";
}

const times = new Map<AppLanguage, Intl.DateTimeFormat>();
const dates = new Map<AppLanguage, Intl.DateTimeFormat>();

// "10:42" today; "23 Nov, 10:42" on an earlier day. Latin digits in every
// language, in Indian time.
export function messageTime(
  createdAt: number,
  today: Day,
  language: AppLanguage,
): string {
  const time = formatter(times, language, {
    hour: "numeric",
    minute: "2-digit",
  });
  const clock = time.format(createdAt);
  if (istDay(createdAt) === today) return clock;
  const date = formatter(dates, language, { day: "numeric", month: "short" });
  return `${date.format(createdAt)}, ${clock}`;
}

function formatter(
  cache: Map<AppLanguage, Intl.DateTimeFormat>,
  language: AppLanguage,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  let format = cache.get(language);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(`${language}-IN`, {
      ...options,
      timeZone: "Asia/Kolkata",
      numberingSystem: "latn",
    });
    cache.set(language, format);
  }
  return format;
}

export type PayOffer = "none" | "optional" | "required";

// Pay online shows while the store takes online payments and the order is
// open and unpaid. An order that waits for its required payment is placed
// only when it is paid.
export function payOffer(
  order: Pick<OrderPage, "status" | "paid" | "payment">,
): PayOffer {
  if (!order.payment.online || order.paid) return "none";
  if (order.status === "awaiting_payment") return "required";
  return order.status === "cancelled" || order.status === "expired"
    ? "none"
    : "optional";
}
