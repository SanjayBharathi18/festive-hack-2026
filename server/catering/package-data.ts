import { randomUUID } from "node:crypto";
import type {
  CateringPackage,
  PackageInput,
  ServiceStyle,
  StoreCatering,
} from "../../shared/catering.ts";
import { sameCity } from "../../shared/cities.ts";
import type { Day } from "../../shared/day.ts";
import type { VegMark } from "../../shared/model.ts";
import type { StoreRating } from "../../shared/search.ts";
import type { Db } from "../db/database.ts";
import { storeRating } from "../stores/store-page.ts";

// Makes the id of a new category or dish from the names that lead to it. The
// demo seed passes stable ids; everything else gets random ones.
export type NewId = (...names: string[]) => string;

type PackageRow = {
  id: string;
  store_id: string;
  kind: CateringPackage["kind"];
  name: string;
  price: number | null;
  min_count: number;
  free_choice: number;
  max_total: number | null;
  service_styles: string;
  staff_extra: number;
  counters_extra: number;
};

type CategoryRow = {
  id: string;
  package_id: string;
  name: string;
  min: number;
  max: number | null;
};

type DishRow = {
  id: string;
  category_id: string;
  name: string;
  veg_mark: VegMark;
  jain: number;
};

export function packagesByStore(
  db: Db,
  storeIds: readonly string[],
): Map<string, CateringPackage[]> {
  const result = new Map<string, CateringPackage[]>();
  if (storeIds.length === 0) return result;
  const ids = JSON.stringify(storeIds);
  const packages = db
    .prepare(
      `SELECT id, store_id, kind, name, price, min_count, free_choice,
        max_total, service_styles, staff_extra, counters_extra
      FROM packages WHERE store_id IN (SELECT value FROM json_each(?))
      ORDER BY position, rowid`,
    )
    .all(ids) as PackageRow[];
  const categories = db
    .prepare(
      `SELECT package_categories.id, package_id, package_categories.name,
        min, max
      FROM package_categories JOIN packages ON packages.id = package_id
      WHERE packages.store_id IN (SELECT value FROM json_each(?))
      ORDER BY package_categories.position, package_categories.rowid`,
    )
    .all(ids) as CategoryRow[];
  const dishes = db
    .prepare(
      `SELECT package_dishes.id, category_id, package_dishes.name, veg_mark,
        jain
      FROM package_dishes
      JOIN package_categories ON package_categories.id = category_id
      JOIN packages ON packages.id = package_id
      WHERE packages.store_id IN (SELECT value FROM json_each(?))
      ORDER BY package_dishes.position, package_dishes.rowid`,
    )
    .all(ids) as DishRow[];
  const dishesOf = Map.groupBy(dishes, ({ category_id }) => category_id);
  const categoriesOf = Map.groupBy(categories, ({ package_id }) => package_id);
  for (const row of packages) {
    const list = result.get(row.store_id) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      name: row.name,
      price: row.price,
      min_count: row.min_count,
      free_choice: row.free_choice === 1,
      max_total: row.max_total,
      service_styles: JSON.parse(row.service_styles) as ServiceStyle[],
      style_extras: {
        staff: row.staff_extra,
        live_counters: row.counters_extra,
      },
      categories: (categoriesOf.get(row.id) ?? []).map((category) => ({
        id: category.id,
        name: category.name,
        min: category.min,
        max: category.max,
        dishes: (dishesOf.get(category.id) ?? []).map((dish) => ({
          id: dish.id,
          name: dish.name,
          veg_mark: dish.veg_mark,
          jain: dish.jain === 1,
        })),
      })),
    });
    result.set(row.store_id, list);
  }
  return result;
}

export function packagesOf(db: Db, storeId: string): CateringPackage[] {
  return packagesByStore(db, [storeId]).get(storeId) ?? [];
}

export function packageOf(
  db: Db,
  storeId: string,
  packageId: string,
): CateringPackage | undefined {
  return packagesOf(db, storeId).find(({ id }) => id === packageId);
}

export function countPackages(db: Db, storeId: string): number {
  return Number(
    db
      .prepare("SELECT count(*) FROM packages WHERE store_id = ?")
      .pluck()
      .get(storeId),
  );
}

// Writes a new package, or replaces the package with this id and all of its
// categories and dishes. The caller runs it in a transaction.
export function writePackage(
  db: Db,
  {
    storeId,
    id,
    input,
    newId = () => randomUUID(),
  }: { storeId: string; id: string; input: PackageInput; newId?: NewId },
): void {
  const values = {
    id,
    store_id: storeId,
    kind: input.kind,
    name: input.name,
    price: input.price,
    min_count: input.min_count,
    free_choice: input.free_choice ? 1 : 0,
    max_total: input.free_choice ? null : input.max_total,
    service_styles: JSON.stringify(input.service_styles),
    staff_extra: input.style_extras.staff,
    counters_extra: input.style_extras.live_counters,
  };
  const updated = db
    .prepare(
      `UPDATE packages SET kind = @kind, name = @name, price = @price,
        min_count = @min_count, free_choice = @free_choice,
        max_total = @max_total, service_styles = @service_styles,
        staff_extra = @staff_extra, counters_extra = @counters_extra
      WHERE id = @id AND store_id = @store_id`,
    )
    .run(values).changes;
  if (updated === 0) {
    db.prepare(
      `INSERT INTO packages (id, store_id, kind, name, price, min_count,
        free_choice, max_total, service_styles, staff_extra, counters_extra,
        position)
      VALUES (@id, @store_id, @kind, @name, @price, @min_count, @free_choice,
        @max_total, @service_styles, @staff_extra, @counters_extra,
        (SELECT coalesce(max(position), -1) + 1 FROM packages
          WHERE store_id = @store_id))`,
    ).run(values);
  }
  db.prepare("DELETE FROM package_categories WHERE package_id = ?").run(id);
  const category = db.prepare(
    `INSERT INTO package_categories (id, package_id, name, min, max, position)
    VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const dish = db.prepare(
    `INSERT INTO package_dishes (id, category_id, name, veg_mark, jain, position)
    VALUES (?, ?, ?, ?, ?, ?)`,
  );
  input.categories.forEach((entry, position) => {
    const categoryId = newId(id, entry.name);
    category.run(
      categoryId,
      id,
      entry.name,
      input.free_choice ? 0 : entry.min,
      input.free_choice ? null : entry.max,
      position,
    );
    entry.dishes.forEach((item, at) => {
      dish.run(
        newId(id, entry.name, item.name),
        categoryId,
        item.name,
        item.veg_mark,
        item.jain ? 1 : 0,
        at,
      );
    });
  });
}

export function deletePackage(db: Db, storeId: string, id: string): boolean {
  return (
    db
      .prepare("DELETE FROM packages WHERE id = ? AND store_id = ?")
      .run(id, storeId).changes === 1
  );
}

export function bookedDates(db: Db, storeId: string, from: Day): Day[] {
  return db
    .prepare(
      "SELECT date FROM closed_dates WHERE store_id = ? AND date >= ? ORDER BY date",
    )
    .pluck()
    .all(storeId, from) as Day[];
}

// The catering section of her store page, when she turned it on and has a
// package.
export function storeCatering(
  db: Db,
  store: { id: string; catering_on: boolean },
  today: Day,
): StoreCatering | null {
  if (!store.catering_on) return null;
  const packages = packagesOf(db, store.id);
  return packages.length === 0
    ? null
    : { packages, booked: bookedDates(db, store.id, today) };
}

export function setCateringOn(db: Db, storeId: string, on: boolean): void {
  db.prepare("UPDATE stores SET catering_on = ? WHERE id = ?").run(
    on ? 1 : 0,
    storeId,
  );
}

export type CateringStore = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  city: string | null;
  is_demo: boolean;
  rating: StoreRating | null;
};

// The stores of the Catering tab: published, in the marketplace with an FSSAI
// number, with catering on, and not booked on the date; with a city, only
// the stores of that city.
export function cateringStores(
  db: Db,
  date: Day | null,
  city: string | null = null,
): CateringStore[] {
  const rows = db
    .prepare(
      `SELECT stores.id, slug, name, area, city, is_demo, rating_average,
        rating_count FROM stores
      JOIN sellers ON sellers.id = stores.seller_id
      WHERE sellers.verified_at IS NOT NULL AND stores.catering_on = 1
        AND stores.in_marketplace = 1 AND stores.fssai IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM closed_dates
          WHERE closed_dates.store_id = stores.id AND closed_dates.date = ?)
      ORDER BY stores.name`,
    )
    .all(date ?? "") as (Omit<CateringStore, "is_demo" | "rating"> & {
    is_demo: number;
    rating_average: number | null;
    rating_count: number;
  })[];
  return rows
    .filter(
      (row) => city === null || (row.city !== null && sameCity(row.city, city)),
    )
    .map(({ rating_average, rating_count, ...row }) => ({
      ...row,
      is_demo: row.is_demo === 1,
      rating: storeRating(rating_average, rating_count),
    }));
}
