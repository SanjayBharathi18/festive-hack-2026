import type { Category, VegMark } from "../../shared/model.ts";
import type { ItemReading, PricePer } from "../../shared/reading.ts";
import {
  needsLatin,
  setupItemSchema,
  type Allergen,
  type SetupItem,
} from "../../shared/setup.ts";
import { packOfRow, rowOfPack } from "./packs.ts";

export type CheckField =
  "name" | "latin" | "category" | "mark" | "price" | "packs" | "allergens";

// The item form, as the reading fills it.
export type FormFill = {
  name: string;
  nameLatin: string;
  category: Category | "";
  vegMark: VegMark | "";
  rupees: string;
  per: PricePer;
  allergens: readonly Allergen[];
};

const required: readonly CheckField[] = ["name", "category", "mark", "packs"];

// The rows of the check list, in the order of the item form. The name in
// English letters shows only for a name in another script.
export function checkFields(reading: ItemReading): CheckField[] {
  const fields: CheckField[] = [
    "name",
    "latin",
    "category",
    "mark",
    "price",
    "packs",
    "allergens",
  ];
  return fields.filter(
    (field) =>
      field !== "latin" || (reading.name !== null && needsLatin(reading.name)),
  );
}

// Whether the model gave this value. A filled value is dashed until she
// adds the item.
export function isFilled(reading: ItemReading, field: CheckField): boolean {
  switch (field) {
    case "name":
      return reading.name !== null;
    case "latin":
      return reading.name_latin !== null;
    case "category":
      return reading.category !== null;
    case "mark":
      return reading.veg_mark !== null;
    case "price":
      return reading.price !== null;
    case "packs":
      return reading.packs.length > 0;
    case "allergens":
      return reading.allergens.length > 0;
  }
}

// The values that the item needs and the reading does not give. With a
// price but no packs, the price is what is missing.
export function missingFields(reading: ItemReading): CheckField[] {
  return required
    .filter((field) => !isFilled(reading, field))
    .map((field) => (field === "packs" ? "price" : field));
}

export function formOfReading(reading: ItemReading): FormFill {
  return {
    name: reading.name ?? "",
    nameLatin: reading.name_latin ?? "",
    category: reading.category ?? "",
    vegMark: reading.veg_mark ?? "",
    rupees: reading.price === null ? "" : String(reading.price.amount / 100),
    per: reading.price?.per ?? "kg",
    allergens: reading.allergens,
  };
}

// The item that she adds with one press, when the reading gave each value
// that an item needs. Its packs keep the prices of the pack rule.
export function itemOfReading(
  reading: ItemReading,
  { id, newId }: { id: string; newId: () => string },
): SetupItem | undefined {
  if (missingFields(reading).length > 0) return undefined;
  const packs = reading.packs.map((pack) => {
    const packId = newId();
    return packOfRow(rowOfPack({ ...pack, id: packId }), packId);
  });
  const parsed = setupItemSchema.safeParse({
    id,
    name: reading.name,
    name_latin:
      reading.name !== null && needsLatin(reading.name)
        ? reading.name_latin
        : null,
    category: reading.category,
    veg_mark: reading.veg_mark,
    box_contents: null,
    allergens: reading.allergens,
    packs,
  });
  return parsed.success ? parsed.data : undefined;
}
