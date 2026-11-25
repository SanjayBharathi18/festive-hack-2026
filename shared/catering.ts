import { z } from "zod";
import { listedStoreSchema } from "./bulk.ts";
import { cityParamSchema } from "./cities.ts";
import { daySchema } from "./day.ts";
import { vegMarkSchema } from "./model.ts";
import { paiseSchema } from "./money.ts";
import { storeRatingSchema } from "./search.ts";

export const packageKindSchema = z.enum(["plate", "buffet"]);
export type PackageKind = z.infer<typeof packageKindSchema>;

export const serviceStyleSchema = z.enum([
  "delivery",
  "staff",
  "live_counters",
]);
export type ServiceStyle = z.infer<typeof serviceStyleSchema>;

export const foodTypeSchema = z.enum(["veg", "non_veg", "jain", "mixed"]);
export type FoodType = z.infer<typeof foodTypeSchema>;

// What serving staff and live counters add to the price of each plate or
// guest. Delivery is the package price.
export const styleExtrasSchema = z.object({
  staff: paiseSchema.max(10_000_00),
  live_counters: paiseSchema.max(10_000_00),
});
export type StyleExtras = z.infer<typeof styleExtrasSchema>;

export const packageLimits = {
  packages: 10,
  categories: 12,
  dishes: 40,
  count: 100_000,
};

const nameSchema = z.string().trim().min(1).max(80);
const countSchema = z.int().min(0).max(packageLimits.dishes);

const dishFields = z.object({
  name: nameSchema,
  veg_mark: vegMarkSchema,
  jain: z.boolean(),
});

export const dishInputSchema = dishFields.refine(
  ({ veg_mark, jain }) => !jain || veg_mark === "veg",
  "A Jain dish is veg.",
);
export type DishInput = z.infer<typeof dishInputSchema>;

export const categoryInputSchema = z
  .object({
    name: nameSchema,
    min: countSchema,
    max: countSchema.positive().nullable(),
    dishes: z.array(dishInputSchema).min(1).max(packageLimits.dishes),
  })
  .refine(
    ({ min, max }) => max === null || max >= min,
    "The most dishes of a category must be at least its fewest.",
  )
  .refine(
    ({ min, dishes }) => min <= dishes.length,
    "A category needs at least as many dishes as its fewest.",
  )
  .refine(
    ({ dishes }) =>
      new Set(dishes.map(({ name }) => sameName(name))).size === dishes.length,
    "Each dish of a category has its own name.",
  );
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const packageInputSchema = z
  .object({
    kind: packageKindSchema,
    name: nameSchema,
    price: paiseSchema.max(100_000_00).nullable(),
    min_count: z.int().positive().max(packageLimits.count),
    free_choice: z.boolean(),
    max_total: z
      .int()
      .positive()
      .max(packageLimits.dishes * 12)
      .nullable(),
    service_styles: z.array(serviceStyleSchema).min(1).max(3),
    style_extras: styleExtrasSchema.default({ staff: 0, live_counters: 0 }),
    categories: z
      .array(categoryInputSchema)
      .min(1)
      .max(packageLimits.categories),
  })
  .refine(
    ({ service_styles }) =>
      new Set(service_styles).size === service_styles.length,
    "Each service style comes once.",
  )
  .refine(
    ({ categories }) =>
      new Set(categories.map(({ name }) => sameName(name))).size ===
      categories.length,
    "Each category has its own name.",
  )
  .refine(
    ({ free_choice, max_total, categories }) =>
      free_choice ||
      max_total === null ||
      max_total >= categories.reduce((sum, { min }) => sum + min, 0),
    "The most dishes of the plate must be at least the fewest of all its categories.",
  );
export type PackageInput = z.infer<typeof packageInputSchema>;

export const packageDishSchema = dishFields.extend({ id: z.uuid() });
export type PackageDish = z.infer<typeof packageDishSchema>;

export const packageCategorySchema = z.object({
  id: z.uuid(),
  name: nameSchema,
  min: countSchema,
  max: countSchema.positive().nullable(),
  dishes: z.array(packageDishSchema),
});
export type PackageCategory = z.infer<typeof packageCategorySchema>;

export const cateringPackageSchema = z.object({
  id: z.uuid(),
  kind: packageKindSchema,
  name: nameSchema,
  price: paiseSchema.nullable(),
  min_count: z.int().positive(),
  free_choice: z.boolean(),
  max_total: z.int().positive().nullable(),
  service_styles: z.array(serviceStyleSchema),
  style_extras: styleExtrasSchema,
  categories: z.array(packageCategorySchema),
});
export type CateringPackage = z.infer<typeof cateringPackageSchema>;

// A package in a list: its price, its minimum and the limit of each category.
export const packageOfferSchema = cateringPackageSchema
  .omit({ categories: true })
  .extend({
    limits: z.array(
      z.object({
        name: nameSchema,
        min: countSchema,
        max: countSchema.positive().nullable(),
      }),
    ),
  });
export type PackageOffer = z.infer<typeof packageOfferSchema>;

export const planDishSchema = z.object({
  category: nameSchema,
  dish: nameSchema,
});
export type PlanDish = z.infer<typeof planDishSchema>;

export const planCategoryCheckSchema = z.object({
  name: nameSchema,
  chosen: z.int().nonnegative(),
  min: countSchema,
  max: countSchema.positive().nullable(),
  over: z.boolean(),
  missing: z.int().nonnegative(),
});
export type PlanCategoryCheck = z.infer<typeof planCategoryCheckSchema>;

// The plate rules for one package and the picked dishes. A free choice has
// no limits. unknown lists the picks that the package does not have.
export const planCheckSchema = z.object({
  categories: z.array(planCategoryCheckSchema),
  total: z.object({
    chosen: z.int().nonnegative(),
    max: z.int().positive().nullable(),
    over: z.boolean(),
  }),
  unknown: z.array(planDishSchema),
  ok: z.boolean(),
});
export type PlanCheck = z.infer<typeof planCheckSchema>;

export const planCheckBodySchema = z.object({
  store_id: z.uuid(),
  package_id: z.uuid(),
  dishes: z.array(planDishSchema).max(packageLimits.dishes * 4),
});
export type PlanCheckBody = z.infer<typeof planCheckBodySchema>;

// fitting: the other packages of the store whose maximums allow the dishes.
export const planCheckAnswerSchema = z.object({
  check: planCheckSchema,
  fitting: z.array(packageOfferSchema),
});
export type PlanCheckAnswer = z.infer<typeof planCheckAnswerSchema>;

// The catering section of the store page. booked: her closed dates from today.
export const storeCateringSchema = z.object({
  packages: z.array(cateringPackageSchema).min(1),
  booked: z.array(daySchema),
});
export type StoreCatering = z.infer<typeof storeCateringSchema>;

const queryNumber = z.coerce.number().int().positive();

export const cateringSearchQuerySchema = z.object({
  city: cityParamSchema,
  date: daySchema.optional(),
  food: foodTypeSchema.optional(),
  guests: queryNumber.max(packageLimits.count).optional(),
  max_price: queryNumber.optional(),
});
export type CateringSearchQuery = z.infer<typeof cateringSearchQuerySchema>;

// rating: the stars of the caterer, or null.
export const catererSchema = z.object({
  store: listedStoreSchema,
  rating: storeRatingSchema.nullable(),
  packages: z.array(packageOfferSchema).min(1),
});
export type Caterer = z.infer<typeof catererSchema>;

export const cateringSearchAnswerSchema = z.object({
  today: daySchema,
  caterers: z.array(catererSchema),
});
export type CateringSearchAnswer = z.infer<typeof cateringSearchAnswerSchema>;

export const deskPackagesSchema = z.object({
  catering_on: z.boolean(),
  packages: z.array(cateringPackageSchema),
});
export type DeskPackages = z.infer<typeof deskPackagesSchema>;

export const cateringSwitchSchema = z.object({ catering_on: z.boolean() });
export type CateringSwitch = z.infer<typeof cateringSwitchSchema>;

export const deskPackageAnswerSchema = z.object({
  package: cateringPackageSchema,
});
export type DeskPackageAnswer = z.infer<typeof deskPackageAnswerSchema>;

// The amount that the service style adds to each plate or guest.
export function styleExtra(
  pkg: Pick<CateringPackage, "style_extras">,
  style: ServiceStyle,
): number {
  return style === "delivery" ? 0 : pkg.style_extras[style];
}

// The price of the plan: the package price and the extra of the service
// style, for each plate or guest. null: the price is on request.
export function planEstimate(
  pkg: Pick<CateringPackage, "price" | "style_extras">,
  count: number,
  style: ServiceStyle,
): number | null {
  return pkg.price === null
    ? null
    : (pkg.price + styleExtra(pkg, style)) * count;
}

export function sameName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}
