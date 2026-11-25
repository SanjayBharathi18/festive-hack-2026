import { createHash, randomBytes, randomUUID } from "node:crypto";
import { addDays, istDay, weekday, type Day } from "../../shared/day.ts";
import type { Clock } from "../clock.ts";
import type { Db } from "../db/database.ts";
import {
  readDemoFixture,
  type DemoFixture,
  type DemoItem,
  type DemoOrder,
  type DemoStore,
} from "./demo-fixture.ts";
import { kiloPacks, piecePacks, type PackSpec } from "./pack-rule.ts";
import {
  clearDemoRequests,
  seedBoardPosts,
  seedCatering,
  seedQuotes,
} from "./seed-bulk-catering.ts";

export const heroSlug = "shobhas-kitchen";
export const testSlug = "test-kitchen";

export type SeedResult = {
  day: Day;
  saturday: Day;
  sunday: Day;
  storeIds: Record<string, string>;
};

type Row = Record<string, string | number | null>;
type SeedDays = Record<Extract<DemoOrder["day"], string>, Day>;
type SeededPack = PackSpec & { id: string; item_id: string };

const orderSpacingMs = 45 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

const storeColumns = [
  "id",
  "seller_id",
  "slug",
  "name",
  "cover_photo",
  "area",
  "city",
  "address",
  "lat",
  "lng",
  "offers_pickup",
  "offers_delivery",
  "accepts_online",
  "advance_for_strangers",
  "in_marketplace",
  "fssai",
  "normal_orders_on",
  "bulk_on",
  "bulk_line",
  "catering_on",
  "paused",
  "limit_unit",
  "daily_limit",
  "last_order_day",
  "working_days",
  "slug_changed",
  "is_demo",
  "rating_average",
  "rating_count",
] as const;

export function seedDemo(
  db: Db,
  clock: Clock,
  fixture: DemoFixture = readDemoFixture(),
): SeedResult {
  const now = clock.now();
  const day = istDay(now);
  const saturday = comingSaturday(day);
  const days: SeedDays = { saturday, sunday: addDays(saturday, 1) };
  const write = prepareStatements(db);
  const storeIds: Record<string, string> = {};
  db.transaction(() => {
    for (const store of fixture.stores) {
      const storeId = stableId("store", store.slug);
      storeIds[store.slug] = storeId;
      if (!store.is_demo && write.storeExists.get(storeId) !== undefined) {
        continue;
      }
      const sellerId = stableId("seller", store.slug);
      write.seller.run({
        id: sellerId,
        phone: store.seller.phone,
        language: store.seller.language,
        verified_at: now,
      });
      write.store.run(storeRow(store, storeId, sellerId));
      if (store.is_demo) {
        write.deleteOrders.run(storeId);
        write.deleteItems.run(storeId);
        write.deleteClosedDates.run(storeId);
        clearDemoRequests(db, storeId);
      }
      seedCatering(db, { store, storeId, days, stableId });
      seedQuotes(db, { store, storeId, day, now, stableId });
      const packs = new Map<string, SeededPack>();
      for (const item of menuOf(fixture, store)) {
        const itemId = stableId("item", store.slug, item.key);
        write.item.run(itemRow(item, itemId, storeId));
        for (const spec of packsOf(item)) {
          const pack = {
            ...spec,
            id: stableId("pack", store.slug, item.key, spec.label),
            item_id: itemId,
          };
          write.pack.run(pack);
          packs.set(packKey(item.key, spec.label), pack);
        }
      }
      store.orders.forEach((order, index) => {
        const lines = order.lines.map(({ item, pack, quantity }) => {
          const found = packs.get(packKey(item, pack));
          if (found === undefined) {
            throw new Error(
              `The demo order ${index + 1} of ${store.slug} names the pack "${pack}" of "${item}", which the menu does not have.`,
            );
          }
          return { pack: found, quantity };
        });
        const orderId = randomUUID();
        const orderDay =
          typeof order.day === "string"
            ? days[order.day]
            : addDays(day, -order.day.days_ago);
        const createdAt =
          typeof order.day === "string"
            ? now - (store.orders.length - index) * orderSpacingMs
            : now - (order.day.days_ago + 1) * dayMs;
        write.order.run({
          id: orderId,
          store_id: storeId,
          number: index + 1,
          token: randomBytes(18).toString("base64url"),
          source: order.source,
          status: order.status,
          fulfilment: order.fulfilment,
          address: order.address ?? null,
          note: order.note ?? null,
          note_language: order.note_language ?? null,
          buyer_name: order.buyer_name,
          buyer_phone: order.buyer_phone,
          buyer_language: order.buyer_language,
          day: orderDay,
          total: lines.reduce(
            (total, { pack, quantity }) => total + pack.price * quantity,
            0,
          ),
          paid: yesNo(order.paid),
          created_at: createdAt,
        });
        for (const { pack, quantity } of lines) {
          write.orderItem.run({
            order_id: orderId,
            item_id: pack.item_id,
            pack_id: pack.id,
            quantity,
            price: pack.price,
            grams: pack.grams,
            pieces: pack.pieces,
          });
        }
      });
    }
    seedBoardPosts(db, fixture.board_posts, { day, now, storeIds, stableId });
  })();
  return { day, ...days, storeIds };
}

function prepareStatements(db: Db) {
  const updates = storeColumns
    .filter((column) => column !== "id")
    .map((column) => `${column} = excluded.${column}`);
  return {
    storeExists: db.prepare("SELECT 1 FROM stores WHERE id = ?").pluck(),
    seller: db.prepare(
      `INSERT INTO sellers (id, phone, language, verified_at)
      VALUES (@id, @phone, @language, @verified_at)
      ON CONFLICT (id) DO UPDATE SET phone = excluded.phone,
        language = excluded.language,
        verified_at = coalesce(sellers.verified_at, excluded.verified_at)`,
    ),
    store: db.prepare(
      `INSERT INTO stores (${storeColumns.join(", ")})
      VALUES (${storeColumns.map((column) => `@${column}`).join(", ")})
      ON CONFLICT (id) DO UPDATE SET ${updates.join(", ")}`,
    ),
    deleteOrders: db.prepare("DELETE FROM orders WHERE store_id = ?"),
    deleteItems: db.prepare("DELETE FROM items WHERE store_id = ?"),
    deleteClosedDates: db.prepare(
      "DELETE FROM closed_dates WHERE store_id = ?",
    ),
    item: db.prepare(
      `INSERT INTO items (id, store_id, name, name_latin, category, veg_mark,
        allergens, box_contents, special, in_menu, in_bulk, bulk_min_qty,
        bulk_unit, bulk_price)
      VALUES (@id, @store_id, @name, @name_latin, @category, @veg_mark,
        @allergens, @box_contents, @special, @in_menu, @in_bulk, @bulk_min_qty,
        @bulk_unit, @bulk_price)`,
    ),
    pack: db.prepare(
      `INSERT INTO packs (id, item_id, label, grams, pieces, price)
      VALUES (@id, @item_id, @label, @grams, @pieces, @price)`,
    ),
    order: db.prepare(
      `INSERT INTO orders (id, store_id, number, token, source, status,
        fulfilment, address, note, note_language, buyer_name, buyer_phone,
        buyer_language, day, total, paid, created_at)
      VALUES (@id, @store_id, @number, @token, @source, @status, @fulfilment,
        @address, @note, @note_language, @buyer_name, @buyer_phone,
        @buyer_language, @day, @total, @paid, @created_at)`,
    ),
    orderItem: db.prepare(
      `INSERT INTO order_items (order_id, item_id, pack_id, quantity, price,
        grams, pieces)
      VALUES (@order_id, @item_id, @pack_id, @quantity, @price, @grams, @pieces)`,
    ),
  };
}

function storeRow(store: DemoStore, id: string, sellerId: string): Row {
  return {
    id,
    seller_id: sellerId,
    slug: store.slug,
    name: store.name,
    cover_photo: null,
    area: store.area,
    city: store.city,
    address: store.address,
    lat: store.lat,
    lng: store.lng,
    offers_pickup: yesNo(store.offers_pickup),
    offers_delivery: yesNo(store.offers_delivery),
    accepts_online: yesNo(store.accepts_online),
    advance_for_strangers: yesNo(store.advance_for_strangers),
    in_marketplace: yesNo(store.in_marketplace),
    fssai: store.fssai,
    normal_orders_on: yesNo(store.normal_orders_on),
    bulk_on: yesNo(store.bulk_on),
    bulk_line: store.bulk_line,
    catering_on: yesNo(store.catering_on),
    paused: 0,
    limit_unit: store.limit_unit,
    daily_limit: store.daily_limit,
    last_order_day: null,
    working_days: store.working_days.reduce(
      (mask, day) => mask | (1 << day),
      0,
    ),
    slug_changed: 0,
    is_demo: yesNo(store.is_demo),
    rating_average: store.rating?.average ?? null,
    rating_count: store.rating?.count ?? 0,
  };
}

function itemRow(item: DemoItem, id: string, storeId: string): Row {
  return {
    id,
    store_id: storeId,
    name: item.name,
    name_latin: item.name_latin,
    category: item.category,
    veg_mark: item.veg_mark,
    allergens: JSON.stringify(item.allergens),
    box_contents: item.box_contents ?? null,
    special: yesNo(item.special),
    in_menu: yesNo(item.in_menu),
    in_bulk: yesNo(item.bulk !== undefined),
    bulk_min_qty: item.bulk?.min_qty ?? null,
    bulk_unit: item.bulk?.unit ?? null,
    bulk_price: item.bulk?.price ?? null,
  };
}

function menuOf(fixture: DemoFixture, store: DemoStore): DemoItem[] {
  if (store.items === undefined && store.menu_of === undefined) return [];
  const items =
    store.items ??
    fixture.stores.find(({ slug }) => slug === store.menu_of)?.items;
  if (items === undefined) {
    throw new Error(
      `The demo store ${store.slug} takes the menu of ${store.menu_of}, which has no items.`,
    );
  }
  return items;
}

export function packsOf(item: DemoItem): PackSpec[] {
  if (item.packs !== undefined) {
    return item.packs.map(({ label, grams, pieces, price }) => ({
      label,
      grams: grams ?? null,
      pieces: pieces ?? null,
      price,
    }));
  }
  if (item.price_per_kg !== undefined) return kiloPacks(item.price_per_kg);
  if (item.price_per_piece !== undefined) {
    return piecePacks(item.price_per_piece, item.grams_per_piece);
  }
  return [];
}

export function comingSaturday(day: Day): Day {
  return addDays(day, ((12 - weekday(day)) % 7) + 1);
}

export function stableId(...parts: string[]): string {
  const hex = createHash("sha256")
    .update(["demo", ...parts].join("\u0000"))
    .digest("hex");
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(
    16,
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function packKey(item: string, label: string): string {
  return `${item}\u0000${label}`;
}

function yesNo(value: boolean): number {
  return value ? 1 : 0;
}
