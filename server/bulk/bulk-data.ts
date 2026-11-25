import type {
  BulkItem,
  BulkUnit,
  ListedStore,
  StoreBulk,
} from "../../shared/bulk.ts";
import { sameCity } from "../../shared/cities.ts";
import type { VegMark } from "../../shared/model.ts";
import type { StoreRating } from "../../shared/search.ts";
import type { Db } from "../db/database.ts";
import { storeRating } from "../stores/store-page.ts";

type BulkItemRow = {
  id: string;
  store_id: string;
  name: string;
  name_latin: string | null;
  veg_mark: VegMark;
  bulk_min_qty: number | null;
  bulk_unit: BulkUnit | null;
  bulk_price: number | null;
};

type ListedStoreRow = Omit<ListedStore, "is_demo"> & {
  is_demo: number;
  bulk_line: string | null;
  rating_average: number | null;
  rating_count: number;
};

export type BulkStore = {
  store: ListedStore;
  rating: StoreRating | null;
  line: string | null;
  items: BulkItem[];
};

export function bulkItemsByStore(
  db: Db,
  storeIds: readonly string[],
): Map<string, BulkItem[]> {
  const rows = db
    .prepare(
      `SELECT id, store_id, name, name_latin, veg_mark, bulk_min_qty, bulk_unit,
        bulk_price
      FROM items
      WHERE in_bulk = 1 AND store_id IN (SELECT value FROM json_each(?))
      ORDER BY rowid`,
    )
    .all(JSON.stringify(storeIds)) as BulkItemRow[];
  const result = new Map<string, BulkItem[]>();
  for (const row of rows) {
    const item = toBulkItem(row);
    if (item === undefined) continue;
    result.set(row.store_id, [...(result.get(row.store_id) ?? []), item]);
  }
  return result;
}

// The bulk section of her store page, when she turned it on.
export function storeBulk(
  db: Db,
  store: { id: string; bulk_on: boolean; bulk_line: string | null },
): StoreBulk | null {
  if (!store.bulk_on) return null;
  const items = bulkItemsByStore(db, [store.id]).get(store.id) ?? [];
  return items.length === 0 ? null : { line: store.bulk_line, items };
}

// The stores of the Bulk and corporate tab: published, in the marketplace
// with an FSSAI number, with the bulk section on and at least one bulk item;
// with a city, only the stores of that city.
export function bulkStores(db: Db, city: string | null = null): BulkStore[] {
  const rows = (
    db
      .prepare(
        `SELECT stores.id, slug, name, area, city, is_demo, bulk_line,
        rating_average, rating_count FROM stores
      JOIN sellers ON sellers.id = stores.seller_id
      WHERE sellers.verified_at IS NOT NULL AND stores.bulk_on = 1
        AND stores.in_marketplace = 1 AND stores.fssai IS NOT NULL
      ORDER BY stores.name`,
      )
      .all() as ListedStoreRow[]
  ).filter(
    (row) => city === null || (row.city !== null && sameCity(row.city, city)),
  );
  const items = bulkItemsByStore(
    db,
    rows.map(({ id }) => id),
  );
  return rows.flatMap(
    ({ bulk_line, is_demo, rating_average, rating_count, ...store }) => {
      const list = items.get(store.id) ?? [];
      return list.length === 0
        ? []
        : [
            {
              store: { ...store, is_demo: is_demo === 1 },
              rating: storeRating(rating_average, rating_count),
              line: bulk_line,
              items: list,
            },
          ];
    },
  );
}

function toBulkItem(row: BulkItemRow): BulkItem | undefined {
  if (row.bulk_min_qty === null || row.bulk_unit === null) return undefined;
  return {
    id: row.id,
    name: row.name,
    name_latin: row.name_latin,
    name_script: null,
    veg_mark: row.veg_mark,
    min_qty: row.bulk_min_qty,
    unit: row.bulk_unit,
    price: row.bulk_price,
  };
}
