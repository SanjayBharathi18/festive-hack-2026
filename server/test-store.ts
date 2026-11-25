import { randomUUID } from "node:crypto";
import type { LimitUnit } from "../shared/model.ts";
import type { Db } from "./db/database.ts";

export type StoreOptions = {
  slug?: string;
  name?: string;
  phone?: string;
  language?: string;
  isDemo?: boolean;
  offersPickup?: boolean;
  offersDelivery?: boolean;
  acceptsOnline?: boolean;
  advanceForStrangers?: boolean;
  paused?: boolean;
  limitUnit?: LimitUnit;
  dailyLimit?: number | null;
  lastOrderDay?: string | null;
  workingDays?: number;
  address?: string;
};

type Pack = { id: string; label: string; grams: number; price: number };

export type TestStore = {
  sellerId: string;
  storeId: string;
  slug: string;
  phone: string;
  items: Record<
    "mysorePak" | "chakkuli" | "kajuKatli",
    { id: string; name: string; packs: [Pack, Pack, Pack] }
  >;
};

const menu = [
  ["mysorePak", "Mysore pak", "sweets", [23000, 45000, 88000]],
  ["chakkuli", "Chakkuli", "savouries", [11000, 21000, 40000]],
  ["kajuKatli", "Kaju katli", "sweets", [33000, 65000, 128000]],
] as const;

export function seedStore(db: Db, options: StoreOptions = {}): TestStore {
  const slug = options.slug ?? "shobhas-kitchen";
  const phone = options.phone ?? "+919800000001";
  const sellerId = randomUUID();
  const storeId = randomUUID();
  db.prepare(
    "INSERT INTO sellers (id, phone, language, verified_at) VALUES (?, ?, ?, 1)",
  ).run(sellerId, phone, options.language ?? "kn");
  db.prepare(
    `INSERT INTO stores (id, seller_id, slug, name, area, city, address, lat, lng,
       offers_pickup, offers_delivery, accepts_online, advance_for_strangers,
       in_marketplace, paused, limit_unit, daily_limit, last_order_day,
       working_days, is_demo)
     VALUES (?, ?, ?, ?, 'Basavanagudi', 'Bengaluru', ?, 12.9417, 77.5755,
       ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
  ).run(
    storeId,
    sellerId,
    slug,
    options.name ?? "Shobha's Kitchen",
    options.address ?? "12, 4th Cross, Basavanagudi",
    flag(options.offersPickup ?? true),
    flag(options.offersDelivery ?? true),
    flag(options.acceptsOnline ?? true),
    flag(options.advanceForStrangers ?? false),
    flag(options.paused ?? false),
    options.limitUnit ?? "kg",
    options.dailyLimit === undefined ? 25_000 : options.dailyLimit,
    options.lastOrderDay ?? null,
    options.workingDays ?? 127,
    flag(options.isDemo ?? false),
  );
  const insertItem = db.prepare(
    "INSERT INTO items (id, store_id, name, category, veg_mark) VALUES (?, ?, ?, ?, 'veg')",
  );
  const insertPack = db.prepare(
    "INSERT INTO packs (id, item_id, label, grams, price) VALUES (?, ?, ?, ?, ?)",
  );
  const items = Object.fromEntries(
    menu.map(([key, name, category, prices]) => {
      const id = randomUUID();
      insertItem.run(id, storeId, name, category);
      const packs = ([250, 500, 1000] as const).map((grams, index) => {
        const pack: Pack = {
          id: randomUUID(),
          label: grams === 1000 ? "1 kg" : `${grams} g`,
          grams,
          price: prices[index] ?? 0,
        };
        insertPack.run(pack.id, id, pack.label, pack.grams, pack.price);
        return pack;
      }) as [Pack, Pack, Pack];
      return [key, { id, name, packs }];
    }),
  ) as TestStore["items"];
  return { sellerId, storeId, slug, phone, items };
}

function flag(value: boolean): number {
  return value ? 1 : 0;
}
