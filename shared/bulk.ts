import { z } from "zod";
import { daySchema } from "./day.ts";
import { appLanguageSchema } from "./languages.ts";
import { vegMarkSchema } from "./model.ts";
import { paiseSchema } from "./money.ts";
import { storeRatingSchema } from "./search.ts";
import { codeSchema } from "./verify.ts";

// A text in the reader's language, next to its original. Pages show the
// Translated badge with the original one tap away.
export const translationSchema = z
  .object({ text: z.string(), language: appLanguageSchema })
  .nullable();
export type TranslationField = z.infer<typeof translationSchema>;

export const bulkUnitSchema = z.enum(["pieces", "kg"]);
export type BulkUnit = z.infer<typeof bulkUnitSchema>;

// price is for one piece or one kg. null is "Price on request".
export const bulkItemSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  name_latin: z.string().min(1).nullable(),
  // The name in the script of the buyer's language, when the page asked for one.
  name_script: z.string().min(1).nullable().default(null),
  veg_mark: vegMarkSchema,
  min_qty: z.int().positive(),
  unit: bulkUnitSchema,
  price: paiseSchema.nullable(),
});
export type BulkItem = z.infer<typeof bulkItemSchema>;

// The bulk section of the store page.
export const storeBulkSchema = z.object({
  line: z.string().min(1).nullable(),
  items: z.array(bulkItemSchema).min(1),
});
export type StoreBulk = z.infer<typeof storeBulkSchema>;

export const listedStoreSchema = z.object({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  area: z.string().nullable(),
  city: z.string().nullable(),
  is_demo: z.boolean(),
});
export type ListedStore = z.infer<typeof listedStoreSchema>;

// example_post: the link token of the demo board post, so that a visitor can
// see the company's side of the request board. rating: her stars, or null.
export const bulkStoresSchema = z.object({
  stores: z.array(
    z.object({
      store: listedStoreSchema,
      rating: storeRatingSchema.nullable(),
      line: z.string().min(1).nullable(),
      items: z.array(bulkItemSchema).min(1),
    }),
  ),
  example_post: z.string().min(16).nullable(),
});
export type BulkStores = z.infer<typeof bulkStoresSchema>;

export const boardUnitSchema = z.enum(["pieces", "boxes", "kg"]);
export type BoardUnit = z.infer<typeof boardUnitSchema>;

export const boardLimits = { items: 20, places: 5 };

export const boardItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.int().positive().max(1_000_000),
  unit: boardUnitSchema,
});
export type BoardItem = z.infer<typeof boardItemSchema>;

const freeMailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.in",
  "ymail.com",
  "rediffmail.com",
  "outlook.com",
  "outlook.in",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "mail.com",
  "yandex.com",
]);

export const workEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("must be an email address, such as priya@company.in"))
  .refine(isWorkEmail, "must be a work email address, not a personal one");
export type WorkEmail = z.output<typeof workEmailSchema>;

// company_name null: the post shows only the description, for example "A
// tech company in Whitefield".
export const boardPostFieldsSchema = z.object({
  company_name: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .transform((name) => (name === "" ? null : name)),
  description: z.string().trim().min(1).max(120),
  items: z.array(boardItemSchema).min(1).max(boardLimits.items),
  need_by: daySchema,
  places: z
    .array(z.string().trim().min(1).max(120))
    .min(1)
    .max(boardLimits.places),
  budget_per_unit: paiseSchema.max(100_000_00).nullable(),
  city: z.string().trim().min(1).max(60),
});
export type BoardPostFields = z.output<typeof boardPostFieldsSchema>;
export type BoardPostFieldsInput = z.input<typeof boardPostFieldsSchema>;

// proof: the proof of the WhatsApp number; email_proof: the proof of the
// work email. Both come from a checked code.
export const boardPostCreateSchema = boardPostFieldsSchema.extend({
  proof: z.string().min(32),
  email_proof: z.string().min(32),
  language: appLanguageSchema,
});
export type BoardPostCreate = z.input<typeof boardPostCreateSchema>;

export const boardPostPatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), post: boardPostFieldsSchema }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("reopen") }),
]);
export type BoardPostPatch = z.input<typeof boardPostPatchSchema>;

// closed_by: null while the post is open; company when the company closed
// it; date after its need-by day.
export const boardPostSchema = z.object({
  id: z.uuid(),
  company_name: z.string().min(1).nullable(),
  description: z.string().min(1),
  items: z.array(boardItemSchema).min(1),
  need_by: daySchema,
  places: z.array(z.string().min(1)).min(1),
  budget_per_unit: paiseSchema.nullable(),
  city: z.string().min(1),
  status: z.enum(["open", "closed"]),
  closed_by: z.enum(["company", "date"]).nullable(),
  is_demo: z.boolean(),
  created_at: z.int(),
  updated_at: z.int(),
});
export type BoardPost = z.infer<typeof boardPostSchema>;

export const boardInterestSchema = z.object({
  store: listedStoreSchema,
  note: z.string().min(1).nullable(),
  note_translation: translationSchema,
  created_at: z.int(),
});
export type BoardInterest = z.infer<typeof boardInterestSchema>;

// The company's page. Only the link of the company gives the interests.
export const boardPostPageSchema = z.object({
  token: z.string().min(16),
  today: daySchema,
  post: boardPostSchema,
  interests: z.array(boardInterestSchema),
});
export type BoardPostPage = z.infer<typeof boardPostPageSchema>;

export const deskInterestSchema = z.object({
  note: z.string().min(1).nullable(),
  note_language: z.string().nullable(),
  created_at: z.int(),
});
export type DeskInterest = z.infer<typeof deskInterestSchema>;

// One post on the request board of a desk, with her answer if she gave one.
// The translations are in the seller's language.
export const deskBoardPostSchema = z.object({
  id: z.uuid(),
  company_name: z.string().min(1).nullable(),
  description: z.string().min(1),
  description_translation: translationSchema,
  items: z
    .array(boardItemSchema.extend({ name_translation: translationSchema }))
    .min(1),
  need_by: daySchema,
  places: z.array(z.string().min(1)).min(1),
  budget_per_unit: paiseSchema.nullable(),
  city: z.string().min(1),
  is_demo: z.boolean(),
  created_at: z.int(),
  interest: deskInterestSchema.nullable(),
});
export type DeskBoardPost = z.infer<typeof deskBoardPostSchema>;

// bulk_on false: her bulk section is off, so the desk shows no board.
export const deskBoardPostsSchema = z.object({
  bulk_on: z.boolean(),
  city: z.string().nullable(),
  posts: z.array(deskBoardPostSchema),
});
export type DeskBoardPosts = z.infer<typeof deskBoardPostsSchema>;

export const interestBodySchema = z.object({
  note: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .default(null)
    .transform((note) => (note === "" ? null : note)),
});
export type InterestBody = z.input<typeof interestBodySchema>;

export const interestAnswerSchema = z.object({
  post_id: z.uuid(),
  interest: deskInterestSchema,
});
export type InterestAnswer = z.infer<typeof interestAnswerSchema>;

export const emailCodeStartSchema = z.object({ email: workEmailSchema });
export type EmailCodeStart = z.input<typeof emailCodeStartSchema>;

export const emailCodeCheckSchema = z.object({
  email: workEmailSchema,
  code: codeSchema,
});
export type EmailCodeCheck = z.input<typeof emailCodeCheckSchema>;

export const emailProofSchema = z.object({
  proof: z.string().min(32),
  expires_at: z.int(),
});
export type EmailProof = z.infer<typeof emailProofSchema>;

export function isWorkEmail(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return domain !== "" && !freeMailDomains.has(domain);
}
