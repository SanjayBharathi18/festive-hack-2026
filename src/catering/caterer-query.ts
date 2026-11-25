import type { FoodType } from "../../shared/catering.ts";

export type CatererFilters = {
  city?: string;
  date: string;
  guests: string;
  maxRupees: string;
  food: FoodType | "";
};

// The query of GET /api/catering/search from the filters of the Catering
// tab and the city of the picker. Empty and wrong values are left out; the
// price goes in paise.
export function catererQuery({
  city = "",
  date,
  guests,
  maxRupees,
  food,
}: CatererFilters): string {
  const query = new URLSearchParams();
  if (city !== "") query.set("city", city);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) query.set("date", date);
  const count = wholeNumber(guests);
  if (count !== undefined) query.set("guests", String(count));
  const rupees = wholeNumber(maxRupees);
  if (rupees !== undefined) query.set("max_price", String(rupees * 100));
  if (food !== "") query.set("food", food);
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

function wholeNumber(value: string): number | undefined {
  const number = Number(value.trim());
  return value.trim() !== "" && Number.isInteger(number) && number > 0
    ? number
    : undefined;
}
