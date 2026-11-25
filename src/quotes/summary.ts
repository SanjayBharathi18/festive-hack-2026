import type { BoardUnit } from "../../shared/bulk.ts";
import type { PackageKind, ServiceStyle } from "../../shared/catering.ts";
import type { QuotePayload } from "../../shared/quotes.ts";
import { formatMoney } from "../text/format.ts";
import type { Text } from "../text/text.ts";

export type Words = Pick<Text, "t" | "day" | "pieces">;

const counts = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// The WhatsApp message that the buyer sends to her number after a request:
// the same summary as the request on her desk. names: the item names as the
// buyer read them, by item id, in place of the names of the seller's script.
export function quoteSummary(
  payload: QuotePayload,
  {
    store,
    buyer,
    names = new Map(),
  }: { store: string; buyer: string; names?: ReadonlyMap<string, string> },
  words: Words,
): string {
  const lines = [...body(payload, store, names, words)];
  if (payload.note !== null) {
    lines.push(words.t("quotes.summary.note", { note: payload.note }));
  }
  lines.push(words.t("quotes.summary.from", { name: buyer }));
  return lines.join("\n");
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function amountWords(
  quantity: number,
  unit: BoardUnit,
  words: Pick<Words, "t" | "pieces">,
): string {
  if (unit === "pieces") return words.pieces(quantity);
  return words.t(unit === "kg" ? "bulk.amount.kg" : "bulk.amount.boxes", {
    count: counts.format(quantity),
  });
}

export function unitPrice(
  price: number | null,
  unit: "pieces" | "kg" | PackageKind,
  words: Pick<Words, "t">,
): string {
  if (price === null) return words.t("quotes.price_on_request");
  const money = formatMoney(price);
  switch (unit) {
    case "pieces":
      return words.t("bulk.price.piece", { money });
    case "kg":
      return words.t("bulk.price.kg", { money });
    case "plate":
      return words.t("catering.price.plate", { money });
    case "buffet":
      return words.t("catering.price.guest", { money });
  }
}

// The service style of a plan with what it adds to each plate or guest:
// "With serving staff +₹40 a plate".
export function serviceWords(
  style: ServiceStyle,
  extra: number,
  kind: PackageKind,
  words: Pick<Words, "t">,
): string {
  const name = words.t(`catering.style.${style}`);
  return extra === 0
    ? name
    : words.t("catering.style_extra", {
        style: name,
        price: unitPrice(extra, kind, words),
      });
}

function* body(
  payload: QuotePayload,
  store: string,
  names: ReadonlyMap<string, string>,
  words: Words,
): Generator<string> {
  switch (payload.kind) {
    case "bulk":
      yield words.t("quotes.summary.hello_bulk", { store });
      for (const line of payload.lines) {
        yield words.t("quotes.summary.line", {
          name: names.get(line.item_id) ?? line.name,
          amount: amountWords(line.quantity, line.unit, words),
          price: unitPrice(line.price, line.unit, words),
        });
      }
      if (payload.need_by !== null) {
        yield words.t("quotes.summary.need_by", {
          day: words.day(payload.need_by, "long"),
        });
      }
      if (payload.place !== null) {
        yield words.t("quotes.summary.place", { place: payload.place });
      }
      if (payload.estimate !== null) {
        yield words.t("quotes.summary.estimate", {
          money: formatMoney(payload.estimate),
        });
      }
      return;
    case "catering": {
      const { event } = payload;
      yield words.t("quotes.summary.hello_catering", { store });
      yield words.t("quotes.summary.package", {
        name: payload.package.name,
        price: unitPrice(payload.package.price, payload.package.kind, words),
      });
      for (const { category, names } of payload.dishes) {
        yield words.t("quotes.summary.dishes", {
          category,
          dishes: names.join(", "),
        });
      }
      yield words.t("quotes.summary.event", {
        day: words.day(event.date, "long"),
        guests: counts.format(event.guests),
        place: event.place,
      });
      yield serviceWords(
        event.service_style,
        payload.service_extra,
        payload.package.kind,
        words,
      );
      if (payload.estimate !== null) {
        yield words.t("quotes.summary.estimate", {
          money: formatMoney(payload.estimate),
        });
      }
      return;
    }
    case "board_post":
      yield words.t("quotes.summary.hello_board_post", {
        store,
        company: payload.company,
      });
      for (const item of payload.items) {
        yield words.t("quotes.summary.board_line", {
          name: item.name,
          amount: amountWords(item.quantity, item.unit, words),
        });
      }
      yield words.t("quotes.summary.need_by", {
        day: words.day(payload.need_by, "long"),
      });
      yield words.t("quotes.summary.place", {
        place: payload.places.join("; "),
      });
      if (payload.budget_per_unit !== null) {
        yield words.t("quotes.summary.budget", {
          money: formatMoney(payload.budget_per_unit),
        });
      }
      if (payload.store_note !== null) {
        yield words.t("quotes.summary.store_note", {
          note: payload.store_note,
        });
      }
      return;
  }
}
