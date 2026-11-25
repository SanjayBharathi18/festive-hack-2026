import type { Day } from "../../shared/day.ts";
import type { AppLanguage } from "../../shared/languages.ts";
import type { Fulfilment, OrderSource } from "../../shared/model.ts";
import { nameText, shownName } from "../../shared/item-names.ts";
import type { CancelReason } from "../../shared/orders.ts";
import { deskShareText, phrases, type MessageLine } from "./templates.ts";

export type MessageDish = MessageLine & {
  item_id: string;
  name_latin: string | null;
};

export type MessageOrder = {
  id: string;
  number: number;
  token: string;
  source: OrderSource;
  buyerPhone: string | null;
  buyerLanguage: AppLanguage | null;
  day: Day;
  fulfilment: Fulfilment;
  total: number;
  cancelReason: CancelReason | null;
  lines: readonly MessageDish[];
  store: { name: string; address: string | null; sellerPhone: string };
};

export function waLink(phone: string | null, text?: string): string {
  const number = phone === null ? "" : phone.replace(/\D/g, "");
  const query = text === undefined ? "" : `?text=${encodeURIComponent(text)}`;
  return `https://wa.me/${number}${query}`;
}

export function orderUrl(publicUrl: string, token: string): string {
  return `${publicUrl}/o/${token}`;
}

export function storeChatUrl(
  order: Pick<MessageOrder, "number" | "buyerLanguage" | "store">,
): string {
  return waLink(
    order.store.sellerPhone,
    phrases[order.buyerLanguage ?? "en"].storeChat(order.number),
  );
}

// Each line names its dish as the buyer's pages do: in English, and in a
// message in another language the name in its script first, from the
// seller's own name or its transliteration by item id, then the English name.
export function buyerLines(
  lines: readonly MessageDish[],
  language: AppLanguage,
  names: ReadonlyMap<string, string> = new Map(),
): MessageLine[] {
  return lines.map((line) => ({
    quantity: line.quantity,
    label: line.label,
    name: nameText(
      shownName(
        { ...line, name_script: names.get(line.item_id) ?? null },
        language,
      ),
    ),
  }));
}

export function deskShareUrl(order: MessageOrder, publicUrl: string): string {
  const language = order.buyerLanguage ?? "en";
  return waLink(
    order.buyerPhone,
    deskShareText(language, {
      store: order.store.name,
      number: order.number,
      lines: buyerLines(order.lines, language),
      total: order.total,
      day: order.day,
      fulfilment: order.fulfilment,
      orderUrl: orderUrl(publicUrl, order.token),
    }),
  );
}
