import { z } from "zod";
import { appLanguageSchema } from "./languages.ts";
import { categorySchema, vegMarkSchema } from "./model.ts";
import { menuItemSchema } from "./store.ts";

const idSchema = z.uuid();
const words = (max: number) => z.string().trim().min(1).max(max);

export const setupLimits = {
  nameLength: 60,
  items: 60,
  packs: 8,
  photoBytes: 2 * 1024 * 1024,
} as const;

export const slugLength = { min: 3, max: 40 } as const;

// The allergens that buyers see on an item (store.allergen.* in the text).
export const allergens = [
  "dairy",
  "nuts",
  "peanuts",
  "sesame",
  "wheat",
  "gluten",
  "soy",
  "egg",
  "mustard",
  "fish",
  "shellfish",
] as const;
export const allergenSchema = z.enum(allergens);
export type Allergen = z.infer<typeof allergenSchema>;

// A store link: /s/<slug>. Small Latin letters, digits and single dashes, so
// it reads the same in every script and survives a WhatsApp message.
export const slugSchema = z
  .string()
  .min(slugLength.min)
  .max(slugLength.max)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "must use small letters a to z, digits and single dashes",
  );

export const slugCheckSchema = z.object({
  slug: slugSchema,
  available: z.boolean(),
  suggestion: slugSchema.nullable(),
});
export type SlugCheck = z.infer<typeof slugCheckSchema>;

// A free link for a store name that has no Latin letters: from the Latin
// form of the name, or made up, so that the link is never empty.
export const slugSuggestionQuerySchema = z.object({
  name: words(setupLimits.nameLength),
  store: idSchema.optional(),
});

export const slugSuggestionSchema = z.object({
  slug: slugSchema,
  from: z.enum(["name", "latin", "made_up"]),
});
export type SlugSuggestion = z.infer<typeof slugSuggestionSchema>;

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Location = z.infer<typeof locationSchema>;

export const setupStoreBodySchema = z
  .object({
    language: appLanguageSchema,
    name: words(setupLimits.nameLength),
    slug: slugSchema,
    offers_pickup: z.boolean(),
    offers_delivery: z.boolean(),
    area: words(60),
    city: words(60),
    address: words(300).nullable(),
    location: locationSchema.nullable(),
  })
  .refine((store) => store.offers_pickup || store.offers_delivery, {
    message: "must offer pickup, delivery or both",
    path: ["offers_pickup"],
  });
export type SetupStoreBody = z.input<typeof setupStoreBodySchema>;

// One pack: a weight or a number of pieces, and its price in paise, from
// ₹1 to ₹1,00,000.
export const setupPackSchema = z
  .object({
    id: idSchema,
    label: words(30),
    grams: z.int().positive().max(100_000).nullable(),
    pieces: z.int().positive().max(10_000).nullable(),
    price: z.int().min(100).max(10_000_000),
  })
  .refine((pack) => pack.grams !== null || pack.pieces !== null, {
    message: "needs a weight or a number of pieces",
    path: ["grams"],
  });
export type SetupPack = z.infer<typeof setupPackSchema>;

export const setupItemSchema = z
  .object({
    id: idSchema,
    name: words(setupLimits.nameLength),
    name_latin: words(setupLimits.nameLength).nullable(),
    category: categorySchema,
    veg_mark: vegMarkSchema,
    box_contents: words(300).nullable(),
    allergens: z.array(allergenSchema).max(allergens.length).optional(),
    packs: z.array(setupPackSchema).min(1).max(setupLimits.packs),
  })
  .refine((item) => distinct(item.packs.map((pack) => pack.id)), {
    message: "has two packs with one id",
    path: ["packs"],
  });
export type SetupItem = z.infer<typeof setupItemSchema>;

export const setupMenuBodySchema = z
  .object({ items: z.array(setupItemSchema).min(1).max(setupLimits.items) })
  .refine(
    ({ items }) =>
      distinct(items.map((item) => item.id)) &&
      distinct(items.flatMap((item) => item.packs.map((pack) => pack.id))),
    { message: "has two items or two packs with one id", path: ["items"] },
  );
export type SetupMenuBody = z.input<typeof setupMenuBodySchema>;

export const publishBodySchema = z.object({
  whatsapp_updates: z.literal(true),
  food_safety: z.literal(true),
});
export type PublishBody = z.infer<typeof publishBodySchema>;

// Her store as she set it up. The address and the pin stay on the server,
// so the answer says only whether they are there.
export const setupStoreSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string().min(1),
  language: appLanguageSchema,
  area: z.string().nullable(),
  city: z.string().nullable(),
  offers_pickup: z.boolean(),
  offers_delivery: z.boolean(),
  has_address: z.boolean(),
  has_location: z.boolean(),
  cover_photo: z.string().nullable(),
  slug_changed: z.boolean(),
  published: z.boolean(),
});
export type SetupStore = z.infer<typeof setupStoreSchema>;

export const setupStateSchema = z.object({
  store: setupStoreSchema,
  items: z.array(menuItemSchema),
});
export type SetupState = z.infer<typeof setupStateSchema>;

export const coverAnswerSchema = z.object({
  cover_photo: z.string().nullable(),
});
export type CoverAnswer = z.infer<typeof coverAnswerSchema>;

export const publishAnswerSchema = z.object({
  store: z.object({ id: idSchema, slug: slugSchema, name: z.string() }),
  url: z.url(),
  qr_svg: z.string().startsWith("/api/stores/"),
});
export type PublishAnswer = z.infer<typeof publishAnswerSchema>;

// A name in another script gets its English letters too, so buyers who read
// another script can read it.
export function needsLatin(name: string): boolean {
  return [...name].some(
    (character) =>
      /\p{L}/u.test(character) && !/\p{Script=Latin}/u.test(character),
  );
}

export function slugFromName(name: string): string {
  const slug = cutSlug(normaliseSlug(name), slugLength.max);
  return slug.length >= slugLength.min ? slug : "";
}

// A link to start from when her name gives none, for example store-k7m2.
export function madeUpSlug(random: () => number = Math.random): string {
  const letters = "abcdefghjkmnpqrstuvwxyz23456789";
  const part = Array.from(
    { length: 4 },
    () => letters[Math.floor(random() * letters.length)] ?? "a",
  ).join("");
  return `store-${part}`;
}

export function normaliseSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function numberedSlug(base: string, number: number): string {
  if (number < 2) return base;
  const suffix = `-${number}`;
  return `${cutSlug(base, slugLength.max - suffix.length)}${suffix}`;
}

export function qrPath(slug: string): string {
  return `/api/stores/${slug}/qr.svg`;
}

function cutSlug(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastDash = cut.lastIndexOf("-");
  const whole =
    slug[max] === "-" || lastDash < slugLength.min
      ? cut
      : cut.slice(0, lastDash);
  return whole.replace(/-+$/, "");
}

function distinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}
