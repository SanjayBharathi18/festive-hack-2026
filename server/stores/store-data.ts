import type { Day } from "../../shared/day.ts";
import type { LimitUnit } from "../../shared/model.ts";
import type { Db } from "../db/database.ts";

export type Store = {
  id: string;
  seller_id: string;
  slug: string;
  name: string;
  cover_photo: string | null;
  area: string | null;
  city: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  offers_pickup: boolean;
  offers_delivery: boolean;
  accepts_online: boolean;
  advance_for_strangers: boolean;
  in_marketplace: boolean;
  fssai: string | null;
  normal_orders_on: boolean;
  bulk_on: boolean;
  bulk_line: string | null;
  catering_on: boolean;
  paused: boolean;
  limit_unit: LimitUnit;
  daily_limit: number | null;
  last_order_day: Day | null;
  working_days: number;
  slug_changed: boolean;
  is_demo: boolean;
};

const yesNoColumns = [
  "offers_pickup",
  "offers_delivery",
  "accepts_online",
  "advance_for_strangers",
  "in_marketplace",
  "normal_orders_on",
  "bulk_on",
  "catering_on",
  "paused",
  "slug_changed",
  "is_demo",
] as const;

export function publishedStoreBySlug(db: Db, slug: string): Store | undefined {
  return publishedStore(db, "slug", slug);
}

export function publishedStoreById(db: Db, id: string): Store | undefined {
  return publishedStore(db, "id", id);
}

function publishedStore(
  db: Db,
  column: "slug" | "id",
  value: string,
): Store | undefined {
  const row = db
    .prepare(
      `SELECT stores.* FROM stores JOIN sellers ON sellers.id = stores.seller_id
      WHERE stores.${column} = ? AND sellers.verified_at IS NOT NULL`,
    )
    .get(value) as Record<string, unknown> | undefined;
  return row === undefined ? undefined : toStore(row);
}

function toStore(row: Record<string, unknown>): Store {
  const store = { ...row };
  for (const column of yesNoColumns) store[column] = row[column] === 1;
  return store as Store;
}
