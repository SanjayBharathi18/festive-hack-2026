import { z } from "zod";
import { boardItemSchema, bulkUnitSchema, translationSchema } from "./bulk.ts";
import {
  packageKindSchema,
  planDishSchema,
  serviceStyleSchema,
} from "./catering.ts";
import { daySchema } from "./day.ts";
import { appLanguageSchema } from "./languages.ts";
import { paiseSchema } from "./money.ts";

export const quoteKindSchema = z.enum(["bulk", "catering", "board_post"]);
export type QuoteKind = z.infer<typeof quoteKindSchema>;

const noteSchema = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .default(null)
  .transform((note) => (note === "" ? null : note));

const placeSchema = z.string().trim().min(1).max(120);

export const eventSchema = z.object({
  date: daySchema,
  guests: z.int().positive().max(100_000),
  place: placeSchema,
  service_style: serviceStyleSchema,
});
export type CateringEvent = z.infer<typeof eventSchema>;

// What the buyer sends. The server takes the names and prices from the
// store, never from the page.
export const bulkQuoteInputSchema = z.object({
  kind: z.literal("bulk"),
  store_id: z.uuid(),
  lines: z
    .array(
      z.object({
        item_id: z.uuid(),
        quantity: z.int().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(30),
  need_by: daySchema.nullable(),
  place: placeSchema.nullable(),
  note: noteSchema,
});

export const cateringQuoteInputSchema = z.object({
  kind: z.literal("catering"),
  store_id: z.uuid(),
  package_id: z.uuid(),
  dishes: z.array(planDishSchema).max(160),
  event: eventSchema,
  note: noteSchema,
});

// board_post: the link token of the company's post. The store answered it.
export const boardPostQuoteInputSchema = z.object({
  kind: z.literal("board_post"),
  store_id: z.uuid(),
  board_post: z.string().min(16).max(64),
  note: noteSchema,
});

export const quoteInputSchema = z.discriminatedUnion("kind", [
  bulkQuoteInputSchema,
  cateringQuoteInputSchema,
  boardPostQuoteInputSchema,
]);
export type QuoteInput = z.input<typeof quoteInputSchema>;

// proof: from a checked WhatsApp code (purpose "order"), used up by the
// request. language: the app language of the buyer's page.
export const quoteBodySchema = z.object({
  proof: z.string().min(32),
  buyer_name: z.string().trim().min(1).max(80),
  language: appLanguageSchema,
  request: quoteInputSchema,
});
export type QuoteBody = z.input<typeof quoteBodySchema>;

// What the request holds, as the desk shows it. estimate is the price times
// the amount (with the extra of a service style), or null when a price is on
// request.
export const bulkQuotePayloadSchema = z.object({
  kind: z.literal("bulk"),
  lines: z
    .array(
      z.object({
        item_id: z.uuid(),
        name: z.string().min(1),
        quantity: z.int().positive(),
        unit: bulkUnitSchema,
        price: paiseSchema.nullable(),
      }),
    )
    .min(1),
  estimate: paiseSchema.nullable(),
  need_by: daySchema.nullable(),
  place: z.string().min(1).nullable(),
  note: z.string().min(1).nullable(),
});
export type BulkQuotePayload = z.infer<typeof bulkQuotePayloadSchema>;

export const cateringQuotePayloadSchema = z.object({
  kind: z.literal("catering"),
  package: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    kind: packageKindSchema,
    price: paiseSchema.nullable(),
    min_count: z.int().positive(),
  }),
  dishes: z.array(
    z.object({
      category: z.string().min(1),
      names: z.array(z.string().min(1)).min(1),
    }),
  ),
  event: eventSchema,
  // What the service style adds to each plate or guest; 0 for delivery.
  service_extra: paiseSchema.default(0),
  estimate: paiseSchema.nullable(),
  note: z.string().min(1).nullable(),
});
export type CateringQuotePayload = z.infer<typeof cateringQuotePayloadSchema>;

// company: the name of the company, or its description when it hides the
// name. store_note: her note on "I can do this".
export const boardPostQuotePayloadSchema = z.object({
  kind: z.literal("board_post"),
  board_post_id: z.uuid(),
  company: z.string().min(1),
  items: z.array(boardItemSchema).min(1),
  need_by: daySchema,
  places: z.array(z.string().min(1)).min(1),
  budget_per_unit: paiseSchema.nullable(),
  store_note: z.string().min(1).nullable(),
  note: z.string().min(1).nullable(),
});
export type BoardPostQuotePayload = z.infer<typeof boardPostQuotePayloadSchema>;

export const quotePayloadSchema = z.discriminatedUnion("kind", [
  bulkQuotePayloadSchema,
  cateringQuotePayloadSchema,
  boardPostQuotePayloadSchema,
]);
export type QuotePayload = z.infer<typeof quotePayloadSchema>;

// The answer to POST /api/quotes. seller_phone opens WhatsApp with the same
// summary: her number shows only after a verified request.
export const quoteAnswerSchema = z.object({
  id: z.uuid(),
  store: z.object({ slug: z.string(), name: z.string().min(1) }),
  seller_phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  request: quotePayloadSchema,
  created_at: z.int(),
});
export type QuoteAnswer = z.infer<typeof quoteAnswerSchema>;

// One request on her desk. The translations are in the seller's language:
// note_translation for request.note, place_translation for the place (or the
// places of a board post), company_translation for request.company.
export const deskQuoteSchema = z.object({
  id: z.uuid(),
  kind: quoteKindSchema,
  created_at: z.int(),
  buyer: z.object({
    name: z.string().min(1),
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
    language: appLanguageSchema,
  }),
  request: quotePayloadSchema,
  note_translation: translationSchema,
  place_translation: translationSchema,
  company_translation: translationSchema,
});
export type DeskQuote = z.infer<typeof deskQuoteSchema>;

export const deskQuotesSchema = z.object({
  quotes: z.array(deskQuoteSchema),
});
export type DeskQuotes = z.infer<typeof deskQuotesSchema>;
