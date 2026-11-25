import { z } from "zod";
import { cityParamSchema } from "./cities.ts";
import { daySchema } from "./day.ts";
import { sarvamLanguageSchema } from "./languages.ts";
import { categorySchema, vegMarkSchema } from "./model.ts";
import { paiseSchema } from "./money.ts";

export const searchSortSchema = z.enum(["distance", "rating"]);
export type SearchSort = z.infer<typeof searchSortSchema>;

// all: no words, so every cook. trigram: the FTS5 index of the Latin forms.
// prefix: a query of 1 or 2 letters, at the start of a word. plain: a
// substring of the original names (ops_search plain, or a query in an Indian
// script that could not be written in Latin).
export const searchMatchSchema = z.enum(["all", "trigram", "prefix", "plain"]);
export type SearchMatch = z.infer<typeof searchMatchSchema>;

export const maxQueryLength = 100;

const absentWhenEmpty = (value: unknown) =>
  value === "" || value === null ? undefined : value;

export const searchQuerySchema = z
  .object({
    q: z.string().trim().max(maxQueryLength).default(""),
    need_by: z.preprocess(absentWhenEmpty, daySchema.optional()),
    veg: z.preprocess(absentWhenEmpty, vegMarkSchema.optional()),
    category: z.preprocess(absentWhenEmpty, categorySchema.optional()),
    sort: z.preprocess(absentWhenEmpty, searchSortSchema.optional()),
    lat: z.preprocess(
      absentWhenEmpty,
      z.coerce.number().min(-90).max(90).optional(),
    ),
    lng: z.preprocess(
      absentWhenEmpty,
      z.coerce.number().min(-180).max(180).optional(),
    ),
    city: cityParamSchema,
  })
  .refine((query) => (query.lat === undefined) === (query.lng === undefined), {
    message: "send lat and lng together",
    path: ["lng"],
  });
export type SearchQuery = z.input<typeof searchQuerySchema>;

// The pack of a dish that a card shows: her cheapest one.
export const searchPackSchema = z.object({
  label: z.string().min(1),
  grams: z.int().positive().nullable(),
  pieces: z.int().positive().nullable(),
  price: paiseSchema,
});
export type SearchPack = z.infer<typeof searchPackSchema>;

export const searchDishSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  name_latin: z.string().min(1).nullable(),
  veg_mark: vegMarkSchema,
  sold_out: z.boolean(),
  pack: searchPackSchema.nullable(),
});
export type SearchDish = z.infer<typeof searchDishSchema>;

// The stars of a store. In this build they are made-up demo data
// (docs/demo-data.md); reviews are on the roadmap.
export const storeRatingSchema = z.object({
  average: z.number().min(1).max(5),
  count: z.int().positive(),
});
export type StoreRating = z.infer<typeof storeRatingSchema>;

// A cook in the results. categories: the kind of her shop, her two biggest
// menu categories, the biggest first. distance_km is rounded on the server, and
// is null with no place to measure from; the store's own location never
// leaves the server. rating is null while she has none: the card says New.
export const searchStoreSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  area: z.string().nullable(),
  city: z.string().nullable(),
  categories: z.array(categorySchema).max(2),
  distance_km: z.number().nonnegative().nullable(),
  rating: storeRatingSchema.nullable(),
  taking_orders: z.boolean(),
  next_free_day: daySchema.nullable(),
  dishes: z.array(searchDishSchema).min(1),
  more_dishes: z.int().nonnegative(),
});
export type SearchStore = z.infer<typeof searchStoreSchema>;

// Where the distances start: the buyer's location, or the centre of the
// city when Nearest has no location. null: no distances.
export const distanceFromSchema = z.enum(["buyer", "centre"]);
export type DistanceFrom = z.infer<typeof distanceFromSchema>;

// latin is the Latin form that the search used, when the query was in an
// Indian script: the page shows it, so the buyer sees what was searched.
// city is the key of the city of the search, or null for every city.
export const searchAnswerSchema = z.object({
  today: daySchema,
  query: z.string(),
  latin: z.string().nullable(),
  match: searchMatchSchema,
  need_by: daySchema.nullable(),
  need_by_met: z.boolean(),
  sort: searchSortSchema,
  located: z.boolean(),
  city: z.string().min(1).nullable(),
  distance_from: distanceFromSchema.nullable(),
  stores: z.array(searchStoreSchema),
  voice: z.boolean(),
  recorded: z.boolean(),
});
export type SearchAnswer = z.infer<typeof searchAnswerSchema>;

export const searchSpeechAnswerSchema = z.object({
  transcript: z.string(),
  language: sarvamLanguageSchema.nullable(),
  recorded: z.boolean(),
  placeholder: z.boolean(),
});
export type SearchSpeechAnswer = z.infer<typeof searchSpeechAnswerSchema>;
