import type { StoreBulk } from "../../shared/bulk.ts";
import type { StoreCatering } from "../../shared/catering.ts";
import type { Day } from "../../shared/day.ts";
import type {
  MenuItem,
  PublicStore,
  StorePage,
  StoreRating,
} from "../../shared/store.ts";
import { nextFreeDay } from "../capacity/capacity.ts";
import type { FlagValues } from "../flags/decisions.ts";
import { menuSections } from "./menu.ts";
import type { StoreCapacity } from "./store-capacity.ts";
import type { Store } from "./store-data.ts";

export type StorePageInput = {
  store: Store;
  rating?: StoreRating | null;
  menu: readonly MenuItem[];
  capacity: StoreCapacity;
  today: Day;
  until: Day;
  flags: FlagValues;
  bulk?: StoreBulk | null;
  catering?: StoreCatering | null;
  recorded: boolean;
};

export function storePage({
  store,
  rating = null,
  menu,
  capacity: { rules, loads },
  today,
  until,
  flags,
  bulk = null,
  catering = null,
  recorded,
}: StorePageInput): StorePage {
  return {
    store: publicStore(store),
    rating,
    sections: menuSections(menu),
    days: {
      today,
      working_days: workingWeekdays(store.working_days),
      closed_dates: [...rules.closed_dates].sort(),
      last_order_day: store.last_order_day,
      next_free_day: nextFreeDay(rules, loads, [], today, until),
    },
    flags: { ops_voice: flags.ops_voice },
    bulk,
    catering,
    recorded,
  };
}

export function publicStore(store: Store): PublicStore {
  return {
    id: store.id,
    slug: store.slug,
    name: store.name,
    cover_photo: store.cover_photo,
    area: store.area,
    city: store.city,
    offers_pickup: store.offers_pickup,
    offers_delivery: store.offers_delivery,
    accepts_online: store.accepts_online,
    advance_for_strangers: store.advance_for_strangers,
    fssai: store.fssai,
    is_demo: store.is_demo,
    paused: store.paused,
    normal_orders_on: store.normal_orders_on,
  };
}

// The stars of a store, from its two columns: none until a buyer rated it.
export function storeRating(
  average: number | null,
  count: number,
): StoreRating | null {
  return average === null || count < 1
    ? null
    : { average: Math.round(average * 10) / 10, count };
}

export function workingWeekdays(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((day) => (mask & (1 << day)) !== 0);
}
