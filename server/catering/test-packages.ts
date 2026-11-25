import { randomUUID } from "node:crypto";
import type { CateringPackage, PackageInput } from "../../shared/catering.ts";
import type { VegMark } from "../../shared/model.ts";

type DishSpec = [name: string, jain?: boolean, mark?: VegMark];

const dishes: Record<string, DishSpec[]> = {
  Sweets: [
    ["Gulab jamun", true],
    ["Mysore pak", true],
    ["Kesari bath", true],
    ["Payasam", true],
  ],
  Starters: [["Gobi manchurian"], ["Paneer tikka"], ["Veg cutlet"]],
  Mains: [
    ["Bisi bele bath"],
    ["Paneer butter masala"],
    ["Veg kurma"],
    ["Dal tadka"],
  ],
  Breads: [["Poori", true], ["Chapati", true], ["Butter naan"]],
  Rice: [["Jeera rice", true], ["Curd rice", true], ["Lemon rice"]],
};

const silverLimits: Record<string, [number, number]> = {
  Sweets: [1, 2],
  Starters: [0, 2],
  Mains: [2, 3],
  Breads: [1, 1],
  Rice: [1, 2],
};

const goldLimits: Record<string, [number, number]> = {
  Sweets: [1, 3],
  Starters: [0, 3],
  Mains: [2, 4],
  Breads: [1, 2],
  Rice: [1, 2],
};

// The packages of Daawat Caterers in docs/demo-data.md, as inputs. The
// plates add ₹40 for serving staff and ₹75 for live counters.
export function daawatInputs(): Record<
  "silver" | "gold" | "buffet",
  PackageInput
> {
  return {
    silver: plateInput("Silver plate", 35_000, 9, silverLimits),
    gold: plateInput("Gold plate", 50_000, 13, goldLimits),
    buffet: {
      kind: "buffet",
      name: "Buffet",
      price: null,
      min_count: 150,
      free_choice: true,
      max_total: null,
      service_styles: ["delivery", "staff", "live_counters"],
      style_extras: { staff: 0, live_counters: 0 },
      categories: categoriesOf(goldLimits).map((category) => ({
        ...category,
        min: 0,
        max: null,
      })),
    },
  };
}

export function daawatPackages(): Record<
  "silver" | "gold" | "buffet",
  CateringPackage
> {
  const inputs = daawatInputs();
  return {
    silver: withIds(inputs.silver),
    gold: withIds(inputs.gold),
    buffet: withIds(inputs.buffet),
  };
}

export function withIds(input: PackageInput): CateringPackage {
  return {
    ...input,
    id: randomUUID(),
    categories: input.categories.map((category) => ({
      ...category,
      id: randomUUID(),
      dishes: category.dishes.map((dish) => ({ ...dish, id: randomUUID() })),
    })),
  };
}

function plateInput(
  name: string,
  price: number,
  maxTotal: number,
  limits: Record<string, [number, number]>,
): PackageInput {
  return {
    kind: "plate",
    name,
    price,
    min_count: 100,
    free_choice: false,
    max_total: maxTotal,
    service_styles: ["delivery", "staff", "live_counters"],
    style_extras: { staff: 40_00, live_counters: 75_00 },
    categories: categoriesOf(limits),
  };
}

function categoriesOf(limits: Record<string, [number, number]>) {
  return Object.entries(limits).map(([category, [min, max]]) => ({
    name: category,
    min,
    max,
    dishes: (dishes[category] ?? []).map(([dish, jain = false, mark]) => ({
      name: dish,
      veg_mark: mark ?? "veg",
      jain,
    })),
  }));
}
