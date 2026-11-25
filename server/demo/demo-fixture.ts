import { readFileSync } from "node:fs";
import { z } from "zod";
import { boardItemSchema } from "../../shared/bulk.ts";
import { packageInputSchema } from "../../shared/catering.ts";
import {
  appLanguageSchema,
  sarvamLanguageSchema,
} from "../../shared/languages.ts";
import {
  categorySchema,
  fulfilmentSchema,
  limitUnitSchema,
  orderSourceSchema,
  orderStatusSchema,
  vegMarkSchema,
} from "../../shared/model.ts";
import { paiseSchema } from "../../shared/money.ts";
import { storeRatingSchema } from "../../shared/store.ts";

export const demoFixtureUrl = new URL(
  "../../fixtures/demo.json",
  import.meta.url,
);

const keySchema = z.string().regex(/^[a-z0-9-]+$/);
const phoneSchema = z.string().regex(/^\+[1-9]\d{6,14}$/);
const everyDay = [0, 1, 2, 3, 4, 5, 6];

const packSpecSchema = z.object({
  label: z.string().min(1),
  grams: z.int().positive().optional(),
  pieces: z.int().positive().optional(),
  price: paiseSchema,
});

const itemSchema = z
  .object({
    key: keySchema,
    name: z.string().min(1),
    name_latin: z.string().min(1),
    category: categorySchema,
    veg_mark: vegMarkSchema,
    allergens: z.array(z.string().min(1)).default([]),
    box_contents: z.string().min(1).optional(),
    special: z.boolean().default(false),
    in_menu: z.boolean().default(true),
    packs: z.array(packSpecSchema).min(1).optional(),
    price_per_kg: paiseSchema.optional(),
    price_per_piece: paiseSchema.optional(),
    grams_per_piece: z.int().positive().optional(),
    bulk: z
      .object({
        min_qty: z.int().positive(),
        unit: z.enum(["pieces", "kg"]),
        price: paiseSchema.nullable(),
      })
      .optional(),
  })
  .refine(
    (item) =>
      [item.packs, item.price_per_kg, item.price_per_piece].filter(
        (spec) => spec !== undefined,
      ).length === (item.in_menu ? 1 : 0),
    "A menu item needs exactly one of packs, price_per_kg or price_per_piece, and a bulk-only item needs none.",
  );

// An order is for the coming Saturday or the Sunday after it, or for a day
// that has passed, so that the khata has money in its last 30 days.
const orderSchema = z
  .object({
    day: z.union([
      z.enum(["saturday", "sunday"]),
      z.object({ days_ago: z.int().min(1).max(29) }),
    ]),
    buyer_name: z.string().min(1),
    buyer_phone: phoneSchema,
    buyer_language: appLanguageSchema,
    source: orderSourceSchema,
    status: orderStatusSchema.default("new"),
    fulfilment: fulfilmentSchema,
    address: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
    note_language: sarvamLanguageSchema.optional(),
    paid: z.boolean().default(false),
    lines: z
      .array(
        z.object({
          item: keySchema,
          pack: z.string().min(1),
          quantity: z.int().positive(),
        }),
      )
      .min(1),
  })
  .refine(
    (order) =>
      (order.fulfilment === "delivery") === (order.address !== undefined),
    "A delivery order has an address, and a pickup order has none.",
  );

const quoteSchema = z.object({
  key: keySchema,
  buyer_name: z.string().min(1),
  buyer_phone: phoneSchema,
  language: appLanguageSchema,
  lines: z
    .array(z.object({ item: keySchema, quantity: z.int().positive() }))
    .min(1),
  need_by_days: z.int().positive().nullable(),
  place: z.string().min(1).nullable(),
  note: z.string().min(1).nullable(),
  minutes_ago: z.int().nonnegative(),
});

const storeSchema = z
  .object({
    slug: keySchema,
    name: z.string().min(1),
    is_demo: z.boolean(),
    seller: z.object({ phone: phoneSchema, language: appLanguageSchema }),
    area: z.string().min(1),
    city: z.string().min(1),
    address: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    offers_pickup: z.boolean(),
    offers_delivery: z.boolean(),
    accepts_online: z.boolean(),
    advance_for_strangers: z.boolean(),
    in_marketplace: z.boolean(),
    fssai: z
      .string()
      .regex(/^\d{14}$/)
      .nullable(),
    // Made-up stars for the cards and the store page (docs/demo-data.md).
    rating: storeRatingSchema.nullable().default(null),
    normal_orders_on: z.boolean().default(true),
    bulk_on: z.boolean().default(false),
    bulk_line: z.string().min(1).nullable().default(null),
    catering_on: z.boolean().default(false),
    closed: z.array(z.enum(["saturday", "sunday"])).default([]),
    packages: z
      .array(packageInputSchema.safeExtend({ key: keySchema }))
      .default([]),
    quotes: z.array(quoteSchema).default([]),
    limit_unit: limitUnitSchema,
    daily_limit: z.int().positive().nullable(),
    working_days: z.array(z.int().min(0).max(6)).min(1).default(everyDay),
    menu_of: keySchema.optional(),
    items: z.array(itemSchema).min(1).optional(),
    orders: z.array(orderSchema).default([]),
  })
  .refine(
    (store) => store.items === undefined || store.menu_of === undefined,
    "A store has its own items or the menu_of another store, not both.",
  )
  .refine(
    (store) =>
      store.items !== undefined ||
      store.menu_of !== undefined ||
      store.packages.length > 0,
    "A store has its own items or the menu_of another store, or catering packages only.",
  )
  .refine(
    (store) =>
      store.quotes.every(({ lines }) =>
        lines.every(({ item }) =>
          store.items?.some(
            ({ key, bulk }) => key === item && bulk !== undefined,
          ),
        ),
      ),
    "Each line of a seed quote names a bulk item of its store.",
  );

const boardPostSchema = z.object({
  key: keySchema,
  company_name: z.string().min(1).nullable(),
  description: z.string().min(1),
  buyer_phone: phoneSchema,
  work_email: z.string().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
  language: appLanguageSchema,
  city: z.string().min(1),
  items: z.array(boardItemSchema).min(1),
  need_by_days: z.int().positive(),
  places: z.array(z.string().min(1)).min(1),
  budget_per_unit: paiseSchema.nullable(),
  interests: z
    .array(z.object({ store: keySchema, note: z.string().min(1).nullable() }))
    .default([]),
});

export const demoFixtureSchema = z
  .object({
    stores: z.array(storeSchema).min(1),
    board_posts: z.array(boardPostSchema).default([]),
  })
  .refine(
    ({ stores }) =>
      new Set(stores.map(({ slug }) => slug)).size === stores.length,
    "Each store has its own slug.",
  )
  .refine(
    ({ stores, board_posts }) =>
      board_posts.every(({ interests }) =>
        interests.every(({ store }) =>
          stores.some(({ slug }) => slug === store),
        ),
      ),
    "Each interest of a board post names a store of the seed.",
  );

export type DemoFixture = z.infer<typeof demoFixtureSchema>;
export type DemoStore = DemoFixture["stores"][number];
export type DemoItem = NonNullable<DemoStore["items"]>[number];
export type DemoOrder = DemoStore["orders"][number];
export type DemoPackage = DemoStore["packages"][number];
export type DemoQuote = DemoStore["quotes"][number];
export type DemoBoardPost = DemoFixture["board_posts"][number];

export function readDemoFixture(url: URL = demoFixtureUrl): DemoFixture {
  const result = demoFixtureSchema.safeParse(
    JSON.parse(readFileSync(url, "utf8")),
  );
  if (result.success) return result.data;
  throw new Error(
    `The demo seed ${url.pathname} is not valid: ${z.prettifyError(result.error)}`,
  );
}
