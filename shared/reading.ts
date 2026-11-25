import { z } from "zod";
import { daySchema } from "./day.ts";
import { sarvamLanguageCodeSchema, sarvamLanguageSchema } from "./languages.ts";
import { categorySchema, fulfilmentSchema, vegMarkSchema } from "./model.ts";
import { paiseSchema } from "./money.ts";
import { allergenSchema } from "./setup.ts";
import { dayCheckSchema } from "./store.ts";

export const maxPartBytes = 1_000_000;
export const maxPartSeconds = 30;
export const minPartSeconds = 0.1;
export const maxParts = 11;
export const maxTextLength = 5_000;
export const wavContentTypes = ["audio/wav", "audio/x-wav", "audio/wave"];

export const readPathSchema = z.enum(["ai", "safe", "manual"]);
export type ReadPath = z.infer<typeof readPathSchema>;

export const readVariantSchema = z.enum(["native", "translate_first"]);
export type ReadVariant = z.infer<typeof readVariantSchema>;

export const readOutcomeSchema = z.enum([
  "ok",
  "invalid",
  "rate_limited",
  "no_credit",
  "error",
  "timeout",
]);
export type ReadOutcome = z.infer<typeof readOutcomeSchema>;

export const askedUnitSchema = z.enum(["kg", "g", "pieces", "packs"]);
export type AskedUnit = z.infer<typeof askedUnitSchema>;

export const partAnswerSchema = z.object({
  part_id: z.uuid(),
  transcript: z.string(),
  language: sarvamLanguageSchema.nullable(),
  language_probability: z.number().min(0).max(1).nullable(),
  seconds: z.number().min(minPartSeconds).max(maxPartSeconds),
  recorded: z.boolean(),
  placeholder: z.boolean(),
});
export type PartAnswer = z.infer<typeof partAnswerSchema>;

const partIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(maxParts)
  .refine((ids) => new Set(ids).size === ids.length, "must not repeat a part");

export const deskReadBodySchema = z
  .object({
    part_ids: partIdsSchema.optional(),
    text: z.string().trim().min(1).max(maxTextLength).optional(),
    language: sarvamLanguageCodeSchema.optional(),
    source: z.enum(["desk", "load"]).default("desk"),
  })
  .refine(
    (body) => (body.part_ids === undefined) !== (body.text === undefined),
    {
      message: "send part_ids or text, not both",
      path: ["part_ids"],
    },
  );
export type DeskReadBody = z.input<typeof deskReadBodySchema>;

const storeSlugSchema = z.string().regex(/^[a-z0-9-]+$/);

export const cartPartQuerySchema = z.object({ store: storeSlugSchema });

export const cartReadBodySchema = z.object({
  store: storeSlugSchema,
  part_ids: partIdsSchema,
  via: z.literal("market").optional(),
});
export type CartReadBody = z.input<typeof cartReadBodySchema>;

export const askedSchema = z.object({
  quantity: z.number().positive().nullable(),
  unit: askedUnitSchema,
  pack_grams: z.int().positive().nullable(),
  pack_pieces: z.int().positive().nullable(),
});
export type Asked = z.infer<typeof askedSchema>;

export const draftPackSchema = z.object({
  pack_id: z.uuid(),
  label: z.string(),
  quantity: z.int().min(1).max(999),
  price: paiseSchema,
  grams: z.int().positive().nullable(),
  pieces: z.int().positive().nullable(),
});
export type DraftPack = z.infer<typeof draftPackSchema>;

export const draftItemSchema = z.object({
  item_id: z.uuid(),
  name: z.string(),
  said: z.string(),
  asked: askedSchema,
  packs: z.array(draftPackSchema).min(1),
  near_amount: z.boolean(),
  near_name: z.boolean(),
  sold_out: z.boolean(),
});
export type DraftItem = z.infer<typeof draftItemSchema>;

export const unmatchedItemSchema = z.object({
  said: z.string(),
  asked: askedSchema,
});
export type UnmatchedItem = z.infer<typeof unmatchedItemSchema>;

export const draftCapacitySchema = dayCheckSchema.extend({
  next_free_day: daySchema.nullable(),
});
export type DraftCapacity = z.infer<typeof draftCapacitySchema>;

export const draftSchema = z.object({
  order_id: z.uuid(),
  items: z.array(draftItemSchema),
  unmatched: z.array(unmatchedItemSchema),
  day: daySchema.nullable(),
  fulfilment: fulfilmentSchema.nullable(),
  buyer_name: z.string().nullable(),
  address: z.string().nullable(),
  note: z.string().nullable(),
  total: paiseSchema,
  capacity: draftCapacitySchema.nullable(),
});
export type Draft = z.infer<typeof draftSchema>;

export const cartReadingSchema = z.object({
  items: z.array(draftItemSchema),
  unmatched: z.array(unmatchedItemSchema),
  day: daySchema.nullable(),
  total: paiseSchema,
});
export type CartReading = z.infer<typeof cartReadingSchema>;

export const readTraceSchema = z.object({
  segment: z.string().nullable(),
  flags_from: z.enum(["flagsmith", "defaults"]),
  in_experiment: z.boolean(),
  duration_ms: z.number().nonnegative(),
  show: z.boolean(),
});
export type ReadTrace = z.infer<typeof readTraceSchema>;

const readAnswerFields = {
  transcript: z.string(),
  language: sarvamLanguageSchema.nullable(),
  path: readPathSchema,
  variant: readVariantSchema.nullable(),
  outcome: readOutcomeSchema,
  show_manual: z.boolean(),
  recorded: z.boolean(),
  placeholder: z.boolean(),
  trace: readTraceSchema,
};

export const deskReadAnswerSchema = z.object({
  ...readAnswerFields,
  translation: z.string().nullable(),
  draft: draftSchema,
});
export type DeskReadAnswer = z.infer<typeof deskReadAnswerSchema>;

export const cartReadAnswerSchema = z.object({
  ...readAnswerFields,
  cart: cartReadingSchema,
});
export type CartReadAnswer = z.infer<typeof cartReadAnswerSchema>;

// Seller setup: one item from her voice parts or her typed words. The
// packs come from her price by the pack rule; she checks each value.
export const itemReadBodySchema = z
  .object({
    part_ids: partIdsSchema.optional(),
    text: z.string().trim().min(1).max(maxTextLength).optional(),
  })
  .refine(
    (body) => (body.part_ids === undefined) !== (body.text === undefined),
    {
      message: "send part_ids or text, not both",
      path: ["part_ids"],
    },
  );
export type ItemReadBody = z.input<typeof itemReadBodySchema>;

export const pricePerSchema = z.enum(["kg", "piece"]);
export type PricePer = z.infer<typeof pricePerSchema>;

export const itemPackSchema = z.object({
  label: z.string().min(1),
  grams: z.int().positive().nullable(),
  pieces: z.int().positive().nullable(),
  price: paiseSchema,
});
export type ItemPack = z.infer<typeof itemPackSchema>;

export const itemReadingSchema = z.object({
  name: z.string().min(1).nullable(),
  name_latin: z.string().min(1).nullable(),
  category: categorySchema.nullable(),
  veg_mark: vegMarkSchema.nullable(),
  price: z.object({ per: pricePerSchema, amount: paiseSchema }).nullable(),
  packs: z.array(itemPackSchema),
  allergens: z.array(allergenSchema),
});
export type ItemReading = z.infer<typeof itemReadingSchema>;

export const itemReadAnswerSchema = z.object({
  transcript: z.string(),
  language: sarvamLanguageSchema.nullable(),
  path: readPathSchema,
  outcome: readOutcomeSchema,
  show_manual: z.boolean(),
  recorded: z.boolean(),
  placeholder: z.boolean(),
  item: itemReadingSchema.nullable(),
});
export type ItemReadAnswer = z.infer<typeof itemReadAnswerSchema>;

export const sellReadStateSchema = z.object({
  reading: z.boolean(),
  voice: z.boolean(),
  recorded: z.boolean(),
});
export type SellReadState = z.infer<typeof sellReadStateSchema>;
