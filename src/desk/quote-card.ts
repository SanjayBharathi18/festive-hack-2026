import type { BoardUnit, BulkUnit } from "../../shared/bulk.ts";
import type { ServiceStyle } from "../../shared/catering.ts";
import type { DeskQuote } from "../../shared/quotes.ts";
import { formatMoney, formatWeight } from "../text/format.ts";
import type { Text, TextKey } from "../text/text.ts";

export type QuoteRow = { name: string; amount: string; price: string };
export type QuoteFact = { label: string; value: string };

// One quote request as her desk shows it: what, how much, when and where,
// the estimate and how to reply. The note, the place and the company are
// the buyer's own words, so the view shows them with their translations.
export type QuoteCard = {
  title: string;
  rows: QuoteRow[];
  facts: QuoteFact[];
  placeLabel: string;
  estimate: string | undefined;
  reply: string;
};

const counts = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const serviceKeys: Record<ServiceStyle, TextKey> = {
  delivery: "desk.quotes.service.delivery",
  staff: "desk.quotes.service.staff",
  live_counters: "desk.quotes.service.live_counters",
};

export function quoteCard(quote: DeskQuote, text: Text): QuoteCard {
  const { request } = quote;
  const reply = replyLink(quote.buyer.phone);
  switch (request.kind) {
    case "bulk":
      return {
        title: text.t("desk.quotes.kind.bulk"),
        rows: request.lines.map((line) => ({
          name: line.name,
          amount: unitAmount(line.quantity, line.unit, text),
          price:
            line.price === null
              ? text.t("desk.quotes.price_on_request")
              : unitPrice(line.price, line.unit, text),
        })),
        facts: dayFact("desk.quotes.need_by", request.need_by, text),
        placeLabel: text.t("desk.quotes.place"),
        estimate: estimateOf(request.estimate),
        reply,
      };
    case "catering": {
      const { event } = request;
      const each =
        request.package.kind === "plate"
          ? "desk.quotes.per_plate"
          : "desk.quotes.per_guest";
      return {
        title: text.t("desk.quotes.kind.catering"),
        rows: [
          {
            name: request.package.name,
            amount: text.t("desk.quotes.guests_count", {
              count: counts.format(event.guests),
            }),
            price:
              request.package.price === null
                ? text.t("desk.quotes.price_on_request")
                : text.t(each, { price: formatMoney(request.package.price) }),
          },
        ],
        facts: [
          ...dayFact("desk.quotes.event_day", event.date, text),
          {
            label: text.t("desk.quotes.service_label"),
            value:
              request.service_extra === 0
                ? text.t(serviceKeys[event.service_style])
                : text.t("catering.style_extra", {
                    style: text.t(serviceKeys[event.service_style]),
                    price: text.t(each, {
                      price: formatMoney(request.service_extra),
                    }),
                  }),
          },
          ...request.dishes.map((dishes) => ({
            label: dishes.category,
            value: dishes.names.join(", "),
          })),
        ],
        placeLabel: text.t("desk.quotes.venue"),
        estimate: estimateOf(request.estimate),
        reply,
      };
    }
    case "board_post":
      return {
        title: text.t("desk.quotes.kind.board_post"),
        rows: request.items.map((item) => ({
          name: item.name,
          amount: unitAmount(item.quantity, item.unit, text),
          price: "",
        })),
        facts: [
          ...dayFact("desk.quotes.need_by", request.need_by, text),
          ...(request.budget_per_unit === null
            ? []
            : [
                {
                  label: text.t("desk.quotes.budget"),
                  value: text.t("desk.quotes.per_unit", {
                    price: formatMoney(request.budget_per_unit),
                  }),
                },
              ]),
          ...(request.store_note === null
            ? []
            : [
                {
                  label: text.t("desk.quotes.your_note"),
                  value: request.store_note,
                },
              ]),
        ],
        placeLabel: text.t("desk.quotes.places"),
        estimate: undefined,
        reply,
      };
  }
}

// The place of a request in the buyer's words: one place, or the places of
// a board post. The server translates the same text.
export function placeOf(quote: DeskQuote): string | null {
  const { request } = quote;
  switch (request.kind) {
    case "bulk":
      return request.place;
    case "catering":
      return request.event.place;
    case "board_post":
      return request.places.join("; ");
  }
}

export function companyOf(quote: DeskQuote): string | null {
  return quote.request.kind === "board_post" ? quote.request.company : null;
}

export function replyLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

export function unitAmount(
  quantity: number,
  unit: BulkUnit | BoardUnit,
  text: Text,
): string {
  if (unit === "kg") return formatWeight(quantity * 1000);
  if (unit === "pieces") return text.pieces(quantity);
  return text.t(
    quantity === 1 ? "desk.quotes.box_one" : "desk.quotes.box_other",
    { count: counts.format(quantity) },
  );
}

function unitPrice(price: number, unit: BulkUnit, text: Text): string {
  return text.t(
    unit === "kg" ? "desk.quotes.per_kg" : "desk.quotes.per_piece",
    {
      price: formatMoney(price),
    },
  );
}

function dayFact(label: TextKey, day: string | null, text: Text): QuoteFact[] {
  return day === null ? [] : [{ label: text.t(label), value: text.day(day) }];
}

function estimateOf(estimate: number | null): string | undefined {
  return estimate === null ? undefined : formatMoney(estimate);
}
