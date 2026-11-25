import { cityKey } from "../../shared/cities.ts";
import { addDays, type Day } from "../../shared/day.ts";
import { distanceKm, type Point } from "../../shared/geo.ts";
import {
  categorySchema,
  type Category,
  type LimitUnit,
  type VegMark,
} from "../../shared/model.ts";
import type {
  SearchDish,
  SearchSort,
  SearchStore,
  StoreRating,
} from "../../shared/search.ts";
import { nextFreeDay } from "../capacity/capacity.ts";
import type { Db } from "../db/database.ts";
import type { ReadingItem } from "../reading/menu.ts";
import { dayWindow, readCapacity } from "../stores/store-capacity.ts";
import { byNeedBy, pinCell, rankStores, roundedKm } from "./rank.ts";
import type { Hit } from "./search-index.ts";

export type Words =
  | { match: "all" }
  | { match: "trigram" | "prefix"; hits: readonly Hit[] }
  | { match: "plain"; text: string };

// origin: where the distances start, the buyer's place or the centre of
// her city; null for no distances. city: any name of a city, or null for
// every city.
export type CatalogRequest = {
  words: Words;
  needBy: Day | null;
  veg: VegMark | null;
  category: Category | null;
  sort: SearchSort;
  origin: Point | null;
  city: string | null;
  today: Day;
};

export type CatalogResult = { stores: SearchStore[]; needByMet: boolean };

type StoreRow = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  paused: number;
  normal_orders_on: number;
  limit_unit: LimitUnit;
  daily_limit: number | null;
  working_days: number;
  last_order_day: Day | null;
  rating_average: number | null;
  rating_count: number;
};

type ItemRow = {
  id: string;
  store_id: string;
  name: string;
  name_latin: string | null;
  category: Category;
  veg_mark: VegMark;
  special: number;
  sold_out: number;
  pack_label: string | null;
  pack_grams: number | null;
  pack_pieces: number | null;
  pack_price: number | null;
};

export const dishesShown = 3;
export const kindsShown = 2;

export const marketplace = `stores.in_marketplace = 1 AND stores.id IN
  (SELECT stores.id FROM stores JOIN sellers ON sellers.id = stores.seller_id
    WHERE sellers.verified_at IS NOT NULL)`;

// A store shows in the three tabs only with her FSSAI number; her own link
// works without it (docs/concept.md, "Make your store better").
const listed = `${marketplace} AND stores.fssai IS NOT NULL`;

// The cooks of the marketplace for one search: the cooks with a dish that
// matches the words and the filters, each cook's next day with space, then
// Need it by and the sort.
export function createCatalog(db: Db) {
  const stores = db.prepare(
    `SELECT id, slug, name, area, city, lat, lng, paused, normal_orders_on,
      limit_unit, daily_limit, working_days, last_order_day, rating_average,
      rating_count
    FROM stores WHERE ${listed}`,
  );
  const items = db.prepare(
    `SELECT items.id, items.store_id, items.name, items.name_latin,
      items.category, items.veg_mark, items.special, items.sold_out,
      packs.label AS pack_label, packs.grams AS pack_grams,
      packs.pieces AS pack_pieces, packs.price AS pack_price
    FROM items JOIN stores ON stores.id = items.store_id
    LEFT JOIN packs ON packs.id = (SELECT cheapest.id FROM packs AS cheapest
      WHERE cheapest.item_id = items.id
      ORDER BY cheapest.price, cheapest.rowid LIMIT 1)
    WHERE items.in_menu = 1 AND ${listed}
    ORDER BY items.rowid`,
  );
  const until = (today: Day) => addDays(today, dayWindow - 1);

  const nextDay = (store: StoreRow, today: Day): Day | null => {
    const capacity = readCapacity(
      db,
      capacityStore(store),
      today,
      until(today),
    );
    return nextFreeDay(capacity.rules, capacity.loads, [], today, until(today));
  };

  return {
    search(request: CatalogRequest): CatalogResult {
      const { today } = request;
      const found = (stores.all() as StoreRow[]).filter(inCity(request.city));
      const menus = Map.groupBy(
        items.all() as ItemRow[],
        (item) => item.store_id,
      );
      const passes = (item: ItemRow) =>
        (request.veg === null || item.veg_mark === request.veg) &&
        (request.category === null || item.category === request.category);
      const matches = matcher(request.words);
      const ranked = found.flatMap((store) => {
        const menu = menus.get(store.id) ?? [];
        const shown = menu.filter(passes);
        const named = matches.store(store);
        const matching = new Set(named ? shown : shown.filter(matches.item));
        if (matching.size === 0) return [];
        return [
          {
            store,
            dishes: orderDishes(shown, matching),
            kinds: mainCategories(menu),
            name: store.name,
            taking_orders: takesOrders(store, today),
            distance:
              request.origin === null ||
              store.lat === null ||
              store.lng === null
                ? null
                : distanceKm(
                    request.origin,
                    pinCell({ lat: store.lat, lng: store.lng }),
                  ),
            rating: ratingOf(store),
            next_free_day: nextDay(store, today),
          },
        ];
      });
      const needBy = byNeedBy(ranked, request.needBy);
      const ordered = needBy.met
        ? rankStores(needBy.stores, request.sort)
        : needBy.stores;
      return {
        needByMet: needBy.met,
        stores: ordered.map((entry) => ({
          slug: entry.store.slug,
          name: entry.store.name,
          area: entry.store.area,
          city: entry.store.city,
          categories: entry.kinds,
          distance_km:
            entry.distance === null ? null : roundedKm(entry.distance),
          rating:
            entry.rating === null
              ? null
              : shownRating(entry.rating, entry.store.rating_count),
          taking_orders: entry.taking_orders,
          next_free_day: entry.next_free_day,
          dishes: entry.dishes.slice(0, dishesShown).map(toDish),
          more_dishes: Math.max(0, entry.dishes.length - dishesShown),
        })),
      };
    },
    // The dish names of the marketplace, as keyterms for speech to text.
    dishNames(): ReadingItem[] {
      return (items.all() as ItemRow[]).map((item) => ({
        id: item.id,
        name: item.name,
        name_latin: item.name_latin,
        sold_out: item.sold_out === 1,
        packs: [],
      }));
    },
  };
}

function inCity(city: string | null): (store: StoreRow) => boolean {
  const key = city === null ? null : cityKey(city);
  return (store) =>
    key === null || (store.city !== null && cityKey(store.city) === key);
}

function matcher(words: Words): {
  store: (store: StoreRow) => boolean;
  item: (item: ItemRow) => boolean;
} {
  switch (words.match) {
    case "all":
      return { store: () => true, item: () => true };
    case "plain": {
      const text = words.text.toLowerCase();
      const has = (name: string | null) =>
        name !== null && name.toLowerCase().includes(text);
      return {
        store: (store) => has(store.name),
        item: (item) => has(item.name) || has(item.name_latin),
      };
    }
    default: {
      const storeIds = new Set(
        words.hits.filter((hit) => hit.kind === "store").map((hit) => hit.id),
      );
      const itemIds = new Set(
        words.hits.filter((hit) => hit.kind === "item").map((hit) => hit.id),
      );
      return {
        store: (store) => storeIds.has(store.id),
        item: (item) => itemIds.has(item.id),
      };
    }
  }
}

// The dishes that match come first, then her others. In each group, the
// dishes she still has come first, and her special ones first among them.
function orderDishes(
  dishes: readonly ItemRow[],
  matching: ReadonlySet<ItemRow>,
): ItemRow[] {
  return [...dishes].sort(
    (a, b) =>
      Number(matching.has(b)) - Number(matching.has(a)) ||
      a.sold_out - b.sold_out ||
      b.special - a.special,
  );
}

// The kind of her shop: the categories with the most dishes on her menu,
// the biggest first, two at most. A tie keeps the menu order.
function mainCategories(menu: readonly ItemRow[]): Category[] {
  const order = categorySchema.options;
  return [...Map.groupBy(menu, (item) => item.category).entries()]
    .sort(
      ([a, aItems], [b, bItems]) =>
        bItems.length - aItems.length || order.indexOf(a) - order.indexOf(b),
    )
    .slice(0, kindsShown)
    .map(([category]) => category);
}

// Her average, while she has ratings: a store with no rating is New.
function ratingOf(store: StoreRow): number | null {
  return store.rating_count > 0 ? store.rating_average : null;
}

// One decimal, as the card shows it.
function shownRating(average: number, count: number): StoreRating {
  return { average: Math.round(average * 10) / 10, count };
}

function takesOrders(store: StoreRow, today: Day): boolean {
  return (
    store.paused === 0 &&
    store.normal_orders_on === 1 &&
    (store.last_order_day === null || store.last_order_day >= today)
  );
}

function capacityStore(store: StoreRow) {
  return {
    id: store.id,
    paused: store.paused === 1,
    normal_orders_on: store.normal_orders_on === 1,
    limit_unit: store.limit_unit,
    daily_limit: store.daily_limit,
    working_days: store.working_days,
    last_order_day: store.last_order_day,
  };
}

function toDish(item: ItemRow): SearchDish {
  return {
    id: item.id,
    name: item.name,
    name_latin: item.name_latin,
    veg_mark: item.veg_mark,
    sold_out: item.sold_out === 1,
    pack:
      item.pack_label === null || item.pack_price === null
        ? null
        : {
            label: item.pack_label,
            grams: item.pack_grams,
            pieces: item.pack_pieces,
            price: item.pack_price,
          },
  };
}
