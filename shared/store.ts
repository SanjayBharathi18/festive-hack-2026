import { z } from "zod";
import { storeBulkSchema } from "./bulk.ts";
import { storeCateringSchema } from "./catering.ts";
import { daySchema } from "./day.ts";
import { appLanguageSchema } from "./languages.ts";
import { categorySchema, limitUnitSchema, vegMarkSchema } from "./model.ts";
import { paiseSchema } from "./money.ts";

const idSchema = z.uuid();

export const packSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  grams: z.int().positive().nullable(),
  pieces: z.int().positive().nullable(),
  price: paiseSchema,
});
export type Pack = z.infer<typeof packSchema>;

export const menuItemSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  name_latin: z.string().min(1).nullable(),
  // The name in the script of the buyer of GET /api/stores/:slug?lang=, when
  // it differs from name (Sarvam transliteration of the Latin form).
  name_script: z.string().min(1).nullable(),
  category: categorySchema,
  veg_mark: vegMarkSchema,
  allergens: z.array(z.string().min(1)),
  box_contents: z.string().nullable(),
  photo: z.string().nullable(),
  special: z.boolean(),
  sold_out: z.boolean(),
  packs: z.array(packSchema),
});
export type MenuItem = z.infer<typeof menuItemSchema>;

export const storeQuerySchema = z.object({
  lang: appLanguageSchema.optional(),
});

export const menuSectionSchema = z.object({
  category: categorySchema,
  items: z.array(menuItemSchema).min(1),
});
export type MenuSection = z.infer<typeof menuSectionSchema>;

export const publicStoreSchema = z.object({
  id: idSchema,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  cover_photo: z.string().nullable(),
  area: z.string().nullable(),
  city: z.string().nullable(),
  offers_pickup: z.boolean(),
  offers_delivery: z.boolean(),
  accepts_online: z.boolean(),
  advance_for_strangers: z.boolean(),
  fssai: z
    .string()
    .regex(/^\d{14}$/)
    .nullable(),
  is_demo: z.boolean(),
  paused: z.boolean(),
  normal_orders_on: z.boolean(),
});
export type PublicStore = z.infer<typeof publicStoreSchema>;

export const storeDaysSchema = z.object({
  today: daySchema,
  working_days: z.array(z.int().min(0).max(6)),
  closed_dates: z.array(daySchema),
  last_order_day: daySchema.nullable(),
  next_free_day: daySchema.nullable(),
});
export type StoreDays = z.infer<typeof storeDaysSchema>;

// The stars of a store, from 1 to 5, and how many buyers gave them. In cycle
// 1 only demo stores have them, as made-up seed data (docs/demo-data.md);
// real ratings come from reviews (Roadmap). null shows "New".
export const storeRatingSchema = z.object({
  average: z.number().min(1).max(5),
  count: z.int().positive(),
});
export type StoreRating = z.infer<typeof storeRatingSchema>;

export const storePageFlagsSchema = z.object({ ops_voice: z.boolean() });
export type StorePageFlags = z.infer<typeof storePageFlagsSchema>;

export const storePageSchema = z.object({
  store: publicStoreSchema,
  rating: storeRatingSchema.nullable(),
  sections: z.array(menuSectionSchema),
  days: storeDaysSchema,
  flags: storePageFlagsSchema,
  // Her bulk and catering sections, when she turned them on.
  bulk: storeBulkSchema.nullable().default(null),
  catering: storeCateringSchema.nullable().default(null),
  // True when Sarvam answers from recorded fixtures (SARVAM_MODE=recorded), so
  // the voice card shows the Recorded badge before the first reading.
  recorded: z.boolean(),
});
export type StorePage = z.infer<typeof storePageSchema>;

export const cartLineSchema = z.object({
  pack_id: idSchema,
  quantity: z.int().min(1).max(999),
});
export type CartLine = z.infer<typeof cartLineSchema>;

export const daysRequestSchema = z.object({
  store_id: idSchema,
  cart: z.array(cartLineSchema).max(100),
});
export type DaysRequest = z.infer<typeof daysRequestSchema>;

export const dayReasonSchema = z.enum([
  "not_taking_orders",
  "after_last_day",
  "not_working",
  "closed",
  "full",
  "not_enough_space",
]);
export type DayReason = z.infer<typeof dayReasonSchema>;

// space_left and cart_load are in the unit of the daily limit: orders,
// pieces, or grams for a kg limit. space_left is null with no daily limit
// and on a day that is not open.
export const dayCheckSchema = z.object({
  day: daySchema,
  fits: z.boolean(),
  reason: dayReasonSchema.nullable(),
  space_left: z.int().nonnegative().nullable(),
});
export type DayCheck = z.infer<typeof dayCheckSchema>;

export const daysResponseSchema = z.object({
  today: daySchema,
  limit_unit: limitUnitSchema,
  cart_load: z.int().nonnegative(),
  days: z.array(dayCheckSchema).min(1),
  next_free_day: daySchema.nullable(),
});
export type DaysResponse = z.infer<typeof daysResponseSchema>;
