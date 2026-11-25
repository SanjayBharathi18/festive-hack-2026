import { z } from "zod";
import { daySchema } from "./day.ts";
import { appLanguageSchema } from "./languages.ts";
import { limitUnitSchema } from "./model.ts";
import { menuItemSchema, storePageFlagsSchema } from "./store.ts";

export const deskStoreSchema = z.object({
  store: z.object({
    id: z.uuid(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    area: z.string().nullable(),
    city: z.string().nullable(),
    is_demo: z.boolean(),
    limit_unit: limitUnitSchema,
    daily_limit: z.int().positive().nullable(),
    offers_pickup: z.boolean(),
    offers_delivery: z.boolean(),
    paused: z.boolean(),
    bulk_on: z.boolean(),
    catering_on: z.boolean(),
    normal_orders_on: z.boolean(),
  }),
  // The sample voice notes of the demo fit the menu of the demo desk only.
  voice_samples: z.boolean(),
  seller_language: appLanguageSchema,
  menu: z.array(menuItemSchema),
  closed_dates: z.array(daySchema),
  flags: storePageFlagsSchema,
  recorded: z.boolean(),
});
export type DeskStore = z.infer<typeof deskStoreSchema>;

export const deskSessionSchema = z.object({ signed_in: z.boolean() });
export type DeskSession = z.infer<typeof deskSessionSchema>;

// The days ahead on which she can close her store: about a year, so that she
// can close the day of a catering event that she agreed early.
export const closeAheadDays = 366;

export const soldOutBodySchema = z.object({ sold_out: z.boolean() });
export type SoldOutBody = z.infer<typeof soldOutBodySchema>;

export const soldOutAnswerSchema = z.object({
  item_id: z.uuid(),
  sold_out: z.boolean(),
});
export type SoldOutAnswer = z.infer<typeof soldOutAnswerSchema>;

export const pausedSchema = z.object({ paused: z.boolean() });
export type Paused = z.infer<typeof pausedSchema>;

export const closedDayBodySchema = z.object({ closed: z.boolean() });
export type ClosedDayBody = z.infer<typeof closedDayBodySchema>;

export const closedDayAnswerSchema = z.object({
  day: daySchema,
  closed: z.boolean(),
});
export type ClosedDayAnswer = z.infer<typeof closedDayAnswerSchema>;
