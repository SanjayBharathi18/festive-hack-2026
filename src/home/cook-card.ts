import { addDays, type Day } from "../../shared/day.ts";
import { shownName } from "../../shared/item-names.ts";
import type { Category } from "../../shared/model.ts";
import type {
  SearchDish,
  SearchStore,
  StoreRating,
} from "../../shared/search.ts";
import { packLabel } from "../cart/pack-label.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { formatMoney } from "../text/format.ts";
import type { Text, TextKey } from "../text/text.ts";
import { availability, ratingWords, shopKind } from "./cook-words.ts";

export type CookCards = { render(store: SearchStore, today: Day): HTMLElement };

const categoryKeys: Record<Category, TextKey> = {
  sweets: "store.category.sweets",
  snacks: "store.category.snacks",
  savouries: "store.category.savouries",
  meals: "store.category.meals",
};

// One cook of the results as a card (src/styles/components/cook-card.css):
// the kind of shop over her name, her stars, up to three dishes as lines of
// a price card, the link to her other dishes and her next day with space.
export function createCookCards(
  templates: { card: HTMLTemplateElement; dish: HTMLTemplateElement },
  text: Text,
  storeHref: (slug: string) => string,
): CookCards {
  const plural = new Intl.PluralRules(`${text.language}-IN`);
  const many = (one: TextKey, other: TextKey, count: number) =>
    plural.select(count) === "one" ? one : other;

  const renderDish = (dish: SearchDish) => {
    const node = cloneTemplate(templates.dish);
    node.dataset.soldOut = String(dish.sold_out);
    const mark = find(node, ".food-mark", HTMLElement);
    if (dish.veg_mark !== "veg") mark.dataset.food = "non-veg";
    mark.setAttribute(
      "aria-label",
      text.t(dish.veg_mark === "veg" ? "store.item.veg" : "store.item.non_veg"),
    );
    const name = shownName(dish, text.language);
    const first = find(node, ".cook-card-dish-first", HTMLElement);
    first.textContent = name.primary;
    if (name.lang !== text.language) first.lang = name.lang;
    const second = find(node, ".cook-card-dish-second", HTMLElement);
    if (name.secondary === null) second.remove();
    else second.textContent = name.secondary;
    find(node, ".cook-card-dish-egg", HTMLElement).hidden =
      dish.veg_mark !== "egg";
    find(node, ".cook-card-pack", HTMLElement).textContent =
      dish.pack === null ? "" : `(${packLabel(dish.pack, text)})`;
    find(node, ".cook-card-price", HTMLElement).textContent = dish.sold_out
      ? text.t("store.item.sold_out")
      : dish.pack === null
        ? ""
        : formatMoney(dish.pack.price);
    return node;
  };

  return {
    render(store, today) {
      const node = cloneTemplate(templates.card);
      const href = storeHref(store.slug);
      node.dataset.closed = String(!store.taking_orders);
      const kind = find(node, ".cook-card-kind", HTMLElement);
      const kindLine = (categories: readonly Category[]) =>
        [
          store.area,
          store.distance_km === null
            ? null
            : text.t("search.store.distance", { km: store.distance_km }),
          shopKind(
            categories,
            (category) => text.t(categoryKeys[category]),
            text.language,
          ),
        ]
          .filter((part) => part !== null && part !== "")
          .join(" · ");
      kind.textContent = kindLine(store.categories.slice(0, 1));
      kind.title = kindLine(store.categories);
      const link = find(node, ".cook-card-link", HTMLAnchorElement);
      link.textContent = store.name;
      link.href = href;
      showRating(
        find(node, ".cook-card-rating", HTMLElement),
        store.rating,
        text,
      );
      find(node, ".cook-card-dishes", HTMLElement).replaceChildren(
        ...store.dishes.map(renderDish),
      );
      const more = find(node, ".cook-card-more", HTMLAnchorElement);
      if (store.more_dishes === 0) more.remove();
      else {
        more.href = href;
        more.textContent = text.t(
          many(
            "search.store.more_one",
            "search.store.more_other",
            store.more_dishes,
          ),
          { count: store.more_dishes },
        );
      }
      const day = find(node, ".cook-card-day", HTMLElement);
      const open = availability(store, today);
      day.dataset.state = open.state;
      day.textContent =
        open.state === "today"
          ? text.t("search.store.available", {
              day: text.t("store.day.today"),
            })
          : open.state === "later"
            ? text.t("search.store.available", {
                day:
                  open.day === addDays(today, 1)
                    ? text.t("store.day.tomorrow")
                    : text.day(open.day, "short"),
              })
            : open.state === "full"
              ? text.t("search.store.full")
              : text.t("search.store.not_taking");
      return node;
    },
  };
}

// The stars of a store on a .cook-card-rating line: "★ 4.8", or "New"
// while she has no rating, with the words for a screen reader.
export function showRating(
  line: HTMLElement,
  rating: StoreRating | null,
  text: Text,
): void {
  const words = ratingWords(rating, text);
  line.dataset.new = String(words.average === null);
  line.replaceChildren(
    hidden(words.spoken),
    words.average === null
      ? shown(text.t("search.store.new"))
      : shown("★ ", span(words.average, "num")),
  );
}

function span(words: string, className: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = words;
  return node;
}

function hidden(words: string): HTMLSpanElement {
  return span(words, "visually-hidden");
}

function shown(...parts: (string | Node)[]): HTMLSpanElement {
  const node = document.createElement("span");
  node.setAttribute("aria-hidden", "true");
  node.append(...parts);
  return node;
}
