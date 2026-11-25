import {
  sameName,
  type CateringPackage,
  type FoodType,
  type PlanCheck,
  type PlanDish,
} from "../../shared/catering.ts";

// The plate rules (docs/system.md, "Catering rules"). Dishes match by the
// names of the category and the dish, so the picks move to another package
// of the same caterer.
export function checkPlan(
  pkg: CateringPackage,
  dishes: readonly PlanDish[],
): PlanCheck {
  const chosen = new Map<string, number>();
  const unknown: PlanDish[] = [];
  for (const pick of uniquePicks(dishes)) {
    const category = pkg.categories.find(
      ({ name }) => sameName(name) === sameName(pick.category),
    );
    const known = category?.dishes.some(
      ({ name }) => sameName(name) === sameName(pick.dish),
    );
    if (category === undefined || known !== true) {
      unknown.push(pick);
      continue;
    }
    chosen.set(category.id, (chosen.get(category.id) ?? 0) + 1);
  }
  const categories = pkg.categories.map(({ id, name, min, max }) => {
    const count = chosen.get(id) ?? 0;
    const fewest = pkg.free_choice ? 0 : min;
    const most = pkg.free_choice ? null : max;
    return {
      name,
      chosen: count,
      min: fewest,
      max: most,
      over: most !== null && count > most,
      missing: Math.max(0, fewest - count),
    };
  });
  const count = categories.reduce((sum, category) => sum + category.chosen, 0);
  const max = pkg.free_choice ? null : pkg.max_total;
  const total = { chosen: count, max, over: max !== null && count > max };
  return {
    categories,
    total,
    unknown,
    ok:
      count > 0 &&
      unknown.length === 0 &&
      !total.over &&
      categories.every(({ over, missing }) => !over && missing === 0),
  };
}

// The packages whose dishes and maximums allow the picks. Minimums do not
// count: the host can add dishes after a change of package.
export function fittingPackages(
  packages: readonly CateringPackage[],
  dishes: readonly PlanDish[],
): CateringPackage[] {
  return packages.filter((pkg) => allows(checkPlan(pkg, dishes)));
}

export function allows(check: PlanCheck): boolean {
  return (
    check.unknown.length === 0 &&
    !check.total.over &&
    check.categories.every(({ over }) => !over)
  );
}

// Veg: each dish is veg. Non-veg: at least one dish is not veg (FSSAI counts
// egg as non-veg). Jain: a Jain dish exists, and each category with a
// minimum has enough Jain dishes to meet it. Mixed: each package.
export function matchesFoodType(pkg: CateringPackage, food: FoodType): boolean {
  const dishes = pkg.categories.flatMap((category) => category.dishes);
  switch (food) {
    case "mixed":
      return true;
    case "veg":
      return dishes.every(({ veg_mark }) => veg_mark === "veg");
    case "non_veg":
      return dishes.some(({ veg_mark }) => veg_mark !== "veg");
    case "jain":
      return (
        dishes.some(({ jain }) => jain) &&
        (pkg.free_choice ||
          pkg.categories.every(
            (category) =>
              category.dishes.filter(({ jain }) => jain).length >= category.min,
          ))
      );
  }
}

function uniquePicks(dishes: readonly PlanDish[]): PlanDish[] {
  const seen = new Set<string>();
  return dishes.filter((pick) => {
    const key = `${sameName(pick.category)}\u0000${sameName(pick.dish)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
