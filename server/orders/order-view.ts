import type {
  DeskSlip,
  OrderMessage,
  OrderPage,
  OrderPayment,
} from "../../shared/orders.ts";
import { deskShareUrl, orderUrl, storeChatUrl } from "../messages/links.ts";
import type { OrderRecord, OrderStore } from "./order-data.ts";
import { nextStamp } from "./stamps.ts";

// names: the dish names in the buyer's script, by item id, when known.
export function orderPage(
  order: OrderRecord,
  messages: OrderMessage[],
  payment: OrderPayment,
  names: ReadonlyMap<string, string> = new Map(),
): OrderPage {
  const pickup = order.fulfilment === "pickup";
  return {
    number: order.number,
    status: order.status,
    paid: order.paid,
    payment_required: order.paymentRequired,
    day: order.day,
    fulfilment: order.fulfilment,
    total: order.total,
    lines: order.lines.map((line) => ({
      ...line,
      name_script: names.get(line.item_id) ?? null,
    })),
    buyer_name: order.buyerName,
    address: pickup ? null : order.address,
    gift:
      order.giftName === null
        ? null
        : { name: order.giftName, message: order.giftMessage },
    note: order.note,
    cancel_reason: order.cancelReason,
    created_at: order.createdAt,
    store: {
      slug: order.store.slug,
      name: order.store.name,
      area: order.store.area,
      city: order.store.city,
      is_demo: order.store.isDemo,
      message_url: storeChatUrl(order),
      pickup: pickup
        ? { address: order.store.address, map_url: mapUrl(order.store) }
        : null,
    },
    messages,
    payment,
  };
}

export function deskSlip(
  order: OrderRecord,
  messages: OrderMessage[],
  publicUrl: string,
): DeskSlip {
  return {
    id: order.id,
    number: order.number,
    token: order.token,
    order_url: orderUrl(publicUrl, order.token),
    share_url: order.source === "desk" ? deskShareUrl(order, publicUrl) : null,
    status: order.status,
    next_stamp: nextStamp(order.status, order.fulfilment),
    paid: order.paid,
    refunded: order.refunded,
    refund: order.refund,
    payment_required: order.paymentRequired,
    source: order.source,
    fulfilment: order.fulfilment,
    day: order.day,
    total: order.total,
    lines: order.lines,
    buyer_name: order.buyerName,
    buyer_phone: order.buyerPhone,
    buyer_language: order.buyerLanguage,
    address: order.address,
    gift:
      order.giftName === null
        ? null
        : {
            name: order.giftName,
            phone: order.giftPhone,
            message: order.giftMessage,
          },
    note: order.note,
    note_translation: null,
    cancel_reason: order.cancelReason,
    reading:
      order.transcript === null
        ? null
        : {
            language: order.readingLanguage,
            variant: order.readingVariant,
            edited: order.edited,
          },
    messages,
    created_at: order.createdAt,
  };
}

export function mapUrl(store: Pick<OrderStore, "address">): string | null {
  return store.address === null
    ? null
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`;
}
