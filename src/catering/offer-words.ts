import type { PackageOffer, ServiceStyle } from "../../shared/catering.ts";
import type { PublicStore } from "../../shared/store.ts";
import { unitPrice } from "../quotes/summary.ts";
import type { Text, TextKey } from "../text/text.ts";

type Limits = Pick<PackageOffer, "free_choice" | "max_total" | "limits">;

// The rules of a package in one line: "Sweets 1–2 · Breads 1 · Starters up
// to 2 · 9 dishes".
export function offerLimits(offer: Limits, text: Pick<Text, "t">): string {
  if (offer.free_choice) return text.t("catering.free_choice");
  const parts = offer.limits.map(({ name, min, max }) =>
    unbroken(text.t(limitKey(min, max), { name, min, max: max ?? "" })),
  );
  if (offer.max_total !== null) {
    parts.push(text.t("catering.plan.offer_total", { count: offer.max_total }));
  }
  return parts.join(" · ");
}

export function offerPrice(
  offer: Pick<PackageOffer, "price" | "kind">,
  text: Pick<Text, "t">,
): string {
  return unitPrice(offer.price, offer.kind, text);
}

export function offerMinimum(
  offer: Pick<PackageOffer, "kind" | "min_count">,
  text: Pick<Text, "t">,
): string {
  return text.t(
    offer.kind === "plate" ? "catering.min.plate" : "catering.min.buffet",
    { count: offer.min_count },
  );
}

// The service styles are choices, so they read as one: "Service: delivery,
// serving staff or live counters".
export function styleWords(
  styles: readonly ServiceStyle[],
  text: Pick<Text, "t" | "language">,
): string {
  const list = new Intl.ListFormat(`${text.language}-IN`, {
    type: "disjunction",
  });
  return text.t("catering.styles_line", {
    styles: list.format(
      styles.map((style) => text.t(`catering.style_short.${style}`)),
    ),
  });
}

// The tag of a store that takes no food orders but takes catering or bulk
// requests, in place of "Not taking orders". undefined: the usual tag.
export function otherWaysTag(
  store: Pick<PublicStore, "normal_orders_on" | "paused">,
  bulk: boolean,
  catering: boolean,
): TextKey | undefined {
  if (store.normal_orders_on || store.paused) return undefined;
  if (catering) {
    return bulk ? "catering.store.only_with_bulk" : "catering.store.only";
  }
  return bulk ? "bulk.store.only" : undefined;
}

// "Breads 1–2" keeps its numbers together, and with its name, on one line.
function unbroken(words: string): string {
  return words.replace(/ (?=\d)/g, "\u00a0").replace(/–/g, "\u2060–\u2060");
}

function limitKey(min: number, max: number | null): TextKey {
  if (max === null) return "catering.limit_open";
  if (min === max) return "catering.limit_exact";
  return min === 0 ? "catering.limit_up_to" : "catering.limit";
}
