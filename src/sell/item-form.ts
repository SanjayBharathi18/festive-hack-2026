import {
  allergenSchema,
  needsLatin,
  setupItemSchema,
  type SetupItem,
} from "../../shared/setup.ts";
import { isPackUnit, packOfRow } from "./packs.ts";

export type PackFields = {
  id: string;
  amount: string;
  unit: string;
  rupees: string;
};

export type ItemFields = {
  id: string;
  name: string;
  nameLatin: string;
  category: string;
  vegMark: string;
  box: boolean;
  boxContents: string;
  allergens: readonly string[];
  packs: readonly PackFields[];
};

// The item as she filled in the form, or undefined when a field is not
// right. The form's own checks say which one; this is the last check.
export function itemOfFields(fields: ItemFields): SetupItem | undefined {
  const packs = fields.packs.map((row) =>
    isPackUnit(row.unit)
      ? packOfRow(
          {
            amount: Number(row.amount),
            unit: row.unit,
            rupees: Number(row.rupees),
          },
          row.id,
        )
      : undefined,
  );
  if (packs.some((pack) => pack === undefined)) return undefined;
  const name = fields.name.trim();
  const latin = fields.nameLatin.trim();
  const contents = fields.boxContents.trim();
  if (fields.box && contents === "") return undefined;
  const parsed = setupItemSchema.safeParse({
    id: fields.id,
    name,
    name_latin: latin !== "" && needsLatin(name) ? latin : null,
    category: fields.category,
    veg_mark: fields.vegMark,
    box_contents: fields.box ? contents : null,
    allergens: fields.allergens.filter(
      (allergen) => allergenSchema.safeParse(allergen).success,
    ),
    packs,
  });
  return parsed.success ? parsed.data : undefined;
}
