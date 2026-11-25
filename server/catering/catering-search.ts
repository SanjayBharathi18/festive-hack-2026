import type {
  CateringPackage,
  CateringSearchQuery,
  PackageOffer,
} from "../../shared/catering.ts";
import { matchesFoodType } from "./plate-rules.ts";

// The packages of one caterer that fit the filters of the Catering tab: the
// food type, a minimum that the guests reach, and a price per plate or guest
// up to the most. A price on request fits any price.
export function matchingPackages(
  packages: readonly CateringPackage[],
  { food, guests, max_price }: Omit<CateringSearchQuery, "date">,
): CateringPackage[] {
  return packages.filter(
    (pkg) =>
      (food === undefined || matchesFoodType(pkg, food)) &&
      (guests === undefined || pkg.min_count <= guests) &&
      (max_price === undefined || pkg.price === null || pkg.price <= max_price),
  );
}

export function offerOf({ categories, ...pkg }: CateringPackage): PackageOffer {
  return {
    ...pkg,
    limits: categories.map(({ name, min, max }) => ({ name, min, max })),
  };
}

// The cheapest priced package first; caterers with only prices on request
// come last, then by name.
export function byLowestPrice<
  T extends { name: string; packages: readonly { price: number | null }[] },
>(a: T, b: T): number {
  return lowest(a) - lowest(b) || a.name.localeCompare(b.name, "en-IN");
}

function lowest({
  packages,
}: {
  packages: readonly { price: number | null }[];
}): number {
  const prices = packages.flatMap(({ price }) =>
    price === null ? [] : [price],
  );
  return prices.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...prices);
}
