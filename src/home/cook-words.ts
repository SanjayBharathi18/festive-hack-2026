import type { Day } from "../../shared/day.ts";
import type { Category } from "../../shared/model.ts";
import type { SearchStore, StoreRating } from "../../shared/search.ts";
import type { Text } from "../text/text.ts";

export type Availability =
  | { state: "today" }
  | { state: "later"; day: Day }
  | { state: "full" }
  | { state: "closed" };

const averages = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const counts = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// The words of a rating: what a screen reader says, with the count, and
// the average to show, or null for a new cook.
export function ratingWords(
  rating: StoreRating | null,
  text: Pick<Text, "t" | "language">,
): { spoken: string; average: string | null } {
  if (rating === null) {
    return { spoken: text.t("search.store.new_label"), average: null };
  }
  const average = averages.format(rating.average);
  const one =
    new Intl.PluralRules(`${text.language}-IN`).select(rating.count) === "one";
  return {
    spoken: text.t(
      one ? "search.store.rating_one" : "search.store.rating_other",
      { rating: average, count: counts.format(rating.count) },
    ),
    average,
  };
}

// Her next day with space.
export function availability(
  store: Pick<SearchStore, "taking_orders" | "next_free_day">,
  today: Day,
): Availability {
  if (!store.taking_orders) return { state: "closed" };
  if (store.next_free_day === null) return { state: "full" };
  return store.next_free_day === today
    ? { state: "today" }
    : { state: "later", day: store.next_free_day };
}

// "Sweets and savouries": her categories as one phrase, in sentence case.
export function shopKind(
  categories: readonly Category[],
  name: (category: Category) => string,
  language: string,
): string {
  const locale = `${language}-IN`;
  const words = new Intl.ListFormat(locale, {
    type: "conjunction",
  }).format(
    categories.map((category) => name(category).toLocaleLowerCase(locale)),
  );
  return words.charAt(0).toLocaleUpperCase(locale) + words.slice(1);
}
