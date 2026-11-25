import type { AppLanguage } from "../../shared/languages.ts";
import {
  numberedSlug,
  type SetupItem,
  type SetupStore,
  type SetupStoreBody,
  type SlugCheck,
} from "../../shared/setup.ts";
import type { Db } from "../db/database.ts";

export type OwnedStore = {
  id: string;
  seller_id: string;
  slug: string;
  name: string;
  cover_photo: string | null;
  slug_changed: boolean;
  published: boolean;
};

export type SaveStoreResult =
  | { ok: true; store: SetupStore }
  | {
      ok: false;
      reason: "not_yours" | "has_store" | "slug_taken" | "slug_changed";
    };

export type SetupData = ReturnType<typeof createSetupData>;

type StoreRow = Omit<OwnedStore, "slug_changed" | "published"> & {
  slug_changed: number;
  published: number;
};

type SetupRow = StoreRow & {
  language: AppLanguage;
  area: string | null;
  city: string | null;
  offers_pickup: number;
  offers_delivery: number;
  has_address: number;
  has_location: number;
};

const suggestionTries = 50;

// Thrown inside a transaction to roll it back; never leaves this module.
const notYours = new Error("An item or a pack id belongs to another store.");

export function createSetupData(db: Db) {
  const storeById = db.prepare(
    `SELECT stores.id, stores.seller_id, stores.slug, stores.name,
      stores.cover_photo, stores.slug_changed,
      sellers.verified_at IS NOT NULL AS published
    FROM stores JOIN sellers ON sellers.id = stores.seller_id
    WHERE stores.id = ?`,
  );
  const setupById = db.prepare(
    `SELECT stores.id, stores.seller_id, stores.slug, stores.name,
      stores.cover_photo, stores.slug_changed, stores.area, stores.city,
      stores.offers_pickup, stores.offers_delivery,
      stores.address IS NOT NULL AS has_address,
      stores.lat IS NOT NULL AND stores.lng IS NOT NULL AS has_location,
      sellers.language, sellers.verified_at IS NOT NULL AS published
    FROM stores JOIN sellers ON sellers.id = stores.seller_id
    WHERE stores.id = ?`,
  );
  const storeOfSeller = db
    .prepare("SELECT id FROM stores WHERE seller_id = ? ORDER BY rowid LIMIT 1")
    .pluck();
  const slugOwner = db.prepare("SELECT id FROM stores WHERE slug = ?").pluck();
  const insertStore = db.prepare(
    `INSERT INTO stores (id, seller_id, slug, name, area, city, address, lat,
      lng, offers_pickup, offers_delivery)
    VALUES (@id, @seller_id, @slug, @name, @area, @city, @address, @lat, @lng,
      @offers_pickup, @offers_delivery)`,
  );
  const updateStore = db.prepare(
    `UPDATE stores SET slug = @slug, name = @name, area = @area, city = @city,
      address = @address, lat = @lat, lng = @lng,
      offers_pickup = @offers_pickup, offers_delivery = @offers_delivery,
      slug_changed = max(slug_changed, @slug_changes)
    WHERE id = @id`,
  );
  const setLanguage = db.prepare(
    "UPDATE sellers SET language = ? WHERE id = ?",
  );
  // Update, then insert: an upsert's ON CONFLICT clause would override the
  // INSERT OR IGNORE in the search triggers of the items table.
  const updateItem = db.prepare(
    `UPDATE items SET name = @name, name_latin = @name_latin,
      category = @category, veg_mark = @veg_mark,
      box_contents = @box_contents, allergens = @allergens, in_menu = 1
    WHERE id = @id AND store_id = @store_id`,
  );
  const insertItem = db.prepare(
    `INSERT INTO items (id, store_id, name, name_latin, category, veg_mark,
      box_contents, allergens)
    VALUES (@id, @store_id, @name, @name_latin, @category, @veg_mark,
      @box_contents, @allergens)`,
  );
  const updatePack = db.prepare(
    `UPDATE packs SET label = @label, grams = @grams, pieces = @pieces,
      price = @price
    WHERE id = @id AND item_id = @item_id`,
  );
  const insertPack = db.prepare(
    `INSERT INTO packs (id, item_id, label, grams, pieces, price)
    VALUES (@id, @item_id, @label, @grams, @pieces, @price)`,
  );
  const packExists = db.prepare("SELECT 1 FROM packs WHERE id = ?").pluck();
  const removeOtherPacks = db.prepare(
    `DELETE FROM packs WHERE item_id = ?
      AND id NOT IN (SELECT value FROM json_each(?))`,
  );
  const otherMenuItems = db
    .prepare(
      `SELECT id FROM items WHERE store_id = ? AND in_menu = 1
        AND id NOT IN (SELECT value FROM json_each(?))`,
    )
    .pluck();
  // An item that an order or her bulk section still names leaves the menu
  // but stays in the table.
  const retireItem = db.prepare(
    `UPDATE items SET in_menu = 0
    WHERE id = ? AND (in_bulk = 1 OR EXISTS (
      SELECT 1 FROM order_items WHERE order_items.item_id = items.id))`,
  );
  const deleteItem = db.prepare(
    `DELETE FROM items WHERE id = ? AND in_bulk = 0 AND NOT EXISTS (
      SELECT 1 FROM order_items WHERE order_items.item_id = items.id)`,
  );
  const itemOwner = db
    .prepare("SELECT store_id FROM items WHERE id = ?")
    .pluck();
  const menuItemCount = db
    .prepare(
      `SELECT count(*) FROM items
      WHERE store_id = ? AND in_menu = 1
        AND EXISTS (SELECT 1 FROM packs WHERE packs.item_id = items.id)`,
    )
    .pluck();
  const setCover = db.prepare("UPDATE stores SET cover_photo = ? WHERE id = ?");
  const markPublished = db.prepare(
    "UPDATE sellers SET verified_at = coalesce(verified_at, ?) WHERE id = ?",
  );

  const owned = (id: string): OwnedStore | undefined => {
    const row = storeById.get(id) as StoreRow | undefined;
    return row && toOwned(row);
  };

  const ownerOf = (slug: string) => slugOwner.get(slug) as string | undefined;

  const writeItem = (storeId: string, item: SetupItem) => {
    const params = itemParams(storeId, item);
    if (updateItem.run(params).changes === 0) {
      if (itemOwner.get(item.id) !== undefined) throw notYours;
      insertItem.run(params);
    }
    for (const pack of item.packs) {
      const row = { ...pack, item_id: item.id };
      if (updatePack.run(row).changes === 1) continue;
      if (packExists.get(pack.id) !== undefined) throw notYours;
      insertPack.run(row);
    }
    removeOtherPacks.run(
      item.id,
      JSON.stringify(item.packs.map((pack) => pack.id)),
    );
  };

  const dropItem = (itemId: string) => {
    retireItem.run(itemId);
    deleteItem.run(itemId);
  };

  const writeMenu = db.transaction(
    (storeId: string, items: readonly SetupItem[]) => {
      for (const item of items) writeItem(storeId, item);
      const kept = JSON.stringify(items.map((item) => item.id));
      for (const id of otherMenuItems.all(storeId, kept) as string[]) {
        dropItem(id);
      }
    },
  );

  const writeOne = db.transaction((storeId: string, item: SetupItem) =>
    writeItem(storeId, item),
  );

  const saveStore = db.transaction(
    (sellerId: string, id: string, body: SetupStoreBody): SaveStoreResult => {
      const existing = owned(id);
      if (existing !== undefined && existing.seller_id !== sellerId) {
        return { ok: false, reason: "not_yours" };
      }
      if (existing === undefined && storeOfSeller.get(sellerId) !== undefined) {
        return { ok: false, reason: "has_store" };
      }
      const owner = ownerOf(body.slug);
      if (owner !== undefined && owner !== id) {
        return { ok: false, reason: "slug_taken" };
      }
      const slugChanges =
        existing !== undefined &&
        existing.published &&
        existing.slug !== body.slug;
      if (slugChanges && existing.slug_changed) {
        return { ok: false, reason: "slug_changed" };
      }
      const params = {
        id,
        seller_id: sellerId,
        slug: body.slug,
        name: body.name.trim(),
        area: body.area.trim(),
        city: body.city.trim(),
        address: body.address?.trim() ?? null,
        lat: body.location?.lat ?? null,
        lng: body.location?.lng ?? null,
        offers_pickup: Number(body.offers_pickup),
        offers_delivery: Number(body.offers_delivery),
      };
      if (existing === undefined) insertStore.run(params);
      else updateStore.run({ ...params, slug_changes: Number(slugChanges) });
      setLanguage.run(body.language, sellerId);
      return { ok: true, store: toSetupStore(setupById.get(id) as SetupRow) };
    },
  );

  return {
    owned,

    setup(id: string): SetupStore | undefined {
      const row = setupById.get(id) as SetupRow | undefined;
      return row && toSetupStore(row);
    },

    storeIdOfSeller(sellerId: string): string | undefined {
      return storeOfSeller.get(sellerId) as string | undefined;
    },

    // The link is free when no store has it, or when the store that has it
    // is hers: a draft from an earlier try keeps its own link.
    checkSlug(slug: string, ownStoreId?: string): SlugCheck {
      const free = (candidate: string) => {
        const owner = ownerOf(candidate);
        return owner === undefined || owner === ownStoreId;
      };
      if (free(slug)) return { slug, available: true, suggestion: null };
      for (let number = 2; number < suggestionTries; number += 1) {
        const candidate = numberedSlug(slug, number);
        if (free(candidate)) {
          return { slug, available: false, suggestion: candidate };
        }
      }
      return { slug, available: false, suggestion: null };
    },

    saveStore(
      sellerId: string,
      id: string,
      body: SetupStoreBody,
    ): SaveStoreResult {
      try {
        return saveStore(sellerId, id, body);
      } catch (error) {
        if (isUniqueSlug(error)) return { ok: false, reason: "slug_taken" };
        throw error;
      }
    },

    // The whole menu: her items as she checked them. Items that are not in
    // it leave the menu. False when an id belongs to another store.
    saveMenu(storeId: string, items: readonly SetupItem[]): boolean {
      return ownWrite(() => writeMenu(storeId, items));
    },

    saveItem(storeId: string, item: SetupItem): boolean {
      return ownWrite(() => writeOne(storeId, item));
    },

    // False when the item is not in this store.
    removeItem(storeId: string, itemId: string): boolean {
      if (itemOwner.get(itemId) !== storeId) return false;
      dropItem(itemId);
      return true;
    },

    // Sets the cover photo and gives the one it replaces.
    setCover(storeId: string, url: string | null): string | null {
      const before = owned(storeId)?.cover_photo ?? null;
      setCover.run(url, storeId);
      return before;
    },

    // Her store goes public: the seller is verified from now. False when the
    // menu has no item with a pack.
    publish(store: OwnedStore, now: number): boolean {
      if ((menuItemCount.get(store.id) as number) === 0) return false;
      markPublished.run(now, store.seller_id);
      return true;
    },
  };
}

function ownWrite(write: () => void): boolean {
  try {
    write();
    return true;
  } catch (error) {
    if (error === notYours) return false;
    throw error;
  }
}

function isUniqueSlug(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_UNIQUE" &&
    error.message.includes("stores.slug")
  );
}

function itemParams(storeId: string, item: SetupItem) {
  return {
    id: item.id,
    store_id: storeId,
    name: item.name.trim(),
    name_latin: item.name_latin?.trim() ?? null,
    category: item.category,
    veg_mark: item.veg_mark,
    box_contents: item.box_contents?.trim() ?? null,
    allergens: JSON.stringify(item.allergens ?? []),
  };
}

function toOwned(row: StoreRow): OwnedStore {
  return {
    ...row,
    slug_changed: row.slug_changed === 1,
    published: row.published === 1,
  };
}

function toSetupStore(row: SetupRow): SetupStore {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    language: row.language,
    area: row.area,
    city: row.city,
    offers_pickup: row.offers_pickup === 1,
    offers_delivery: row.offers_delivery === 1,
    has_address: row.has_address === 1,
    has_location: row.has_location === 1,
    cover_photo: row.cover_photo,
    slug_changed: row.slug_changed === 1,
    published: row.published === 1,
  };
}
