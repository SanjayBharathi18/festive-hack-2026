import assert from "node:assert/strict";
import { test } from "node:test";
import type { CateringPackage, PlanDish } from "../../shared/catering.ts";
import {
  allows,
  checkPlan,
  fittingPackages,
  matchesFoodType,
} from "./plate-rules.ts";
import { daawatPackages, withIds } from "./test-packages.ts";

const pick = (category: string, dish: string): PlanDish => ({
  category,
  dish,
});

const silverPlan = [
  pick("Sweets", "Gulab jamun"),
  pick("Sweets", "Mysore pak"),
  pick("Mains", "Bisi bele bath"),
  pick("Mains", "Veg kurma"),
  pick("Breads", "Poori"),
  pick("Rice", "Curd rice"),
];

test("a plan within each minimum and maximum is ok", () => {
  const { silver } = daawatPackages();
  const check = checkPlan(silver, silverPlan);
  assert.equal(check.ok, true);
  assert.deepEqual(check.total, { chosen: 6, max: 9, over: false });
  assert.deepEqual(check.unknown, []);
  assert.deepEqual(
    check.categories.map(({ name, chosen, missing, over }) => [
      name,
      chosen,
      missing,
      over,
    ]),
    [
      ["Sweets", 2, 0, false],
      ["Starters", 0, 0, false],
      ["Mains", 2, 0, false],
      ["Breads", 1, 0, false],
      ["Rice", 1, 0, false],
    ],
  );
});

test("a third sweet on the Silver plate is over its maximum of 2", () => {
  const { silver } = daawatPackages();
  const check = checkPlan(silver, [
    ...silverPlan,
    pick("Sweets", "Kesari bath"),
  ]);
  assert.equal(check.ok, false);
  assert.deepEqual(check.categories[0], {
    name: "Sweets",
    chosen: 3,
    min: 1,
    max: 2,
    over: true,
    missing: 0,
  });
  assert.equal(allows(check), false);
});

test("a category under its minimum says how many dishes are still needed", () => {
  const { silver } = daawatPackages();
  const check = checkPlan(silver, [pick("Sweets", "Payasam")]);
  assert.equal(check.ok, false);
  assert.deepEqual(
    check.categories
      .filter(({ missing }) => missing > 0)
      .map(({ name, missing }) => [name, missing]),
    [
      ["Mains", 2],
      ["Breads", 1],
      ["Rice", 1],
    ],
  );
  assert.equal(allows(check), true);
});

test("the total maximum counts the dishes of all categories", () => {
  const { silver } = daawatPackages();
  const check = checkPlan(silver, [
    ...silverPlan,
    pick("Starters", "Gobi manchurian"),
    pick("Starters", "Paneer tikka"),
    pick("Mains", "Dal tadka"),
    pick("Rice", "Lemon rice"),
  ]);
  assert.deepEqual(check.total, { chosen: 10, max: 9, over: true });
  assert.equal(
    check.categories.some(({ over }) => over),
    false,
  );
  assert.equal(check.ok, false);
});

test("names match without case or extra spaces, and a repeated pick counts once", () => {
  const { silver } = daawatPackages();
  const check = checkPlan(silver, [
    ...silverPlan,
    pick(" sweets", "GULAB  jamun"),
  ]);
  assert.equal(check.total.chosen, 6);
  assert.equal(check.ok, true);
});

test("a dish that the package does not have is unknown, and the plan is not ok", () => {
  const { silver } = daawatPackages();
  const check = checkPlan(silver, [...silverPlan, pick("Sweets", "Rasmalai")]);
  assert.deepEqual(check.unknown, [pick("Sweets", "Rasmalai")]);
  assert.equal(check.ok, false);
  assert.equal(allows(check), false);
});

test("an empty plan is not ok, even with free choice", () => {
  const { silver, buffet } = daawatPackages();
  assert.equal(checkPlan(silver, []).ok, false);
  assert.equal(checkPlan(buffet, []).ok, false);
});

test("a free choice has no limits", () => {
  const { buffet } = daawatPackages();
  const sweets = ["Gulab jamun", "Mysore pak", "Kesari bath", "Payasam"].map(
    (dish) => pick("Sweets", dish),
  );
  const check = checkPlan(buffet, sweets);
  assert.equal(check.ok, true);
  assert.deepEqual(check.total, { chosen: 4, max: null, over: false });
  assert.deepEqual(check.categories[0], {
    name: "Sweets",
    chosen: 4,
    min: 0,
    max: null,
    over: false,
    missing: 0,
  });
});

test("the Gold plate and the buffet allow a third sweet, the Silver plate does not", () => {
  const { silver, gold, buffet } = daawatPackages();
  const plan = [...silverPlan, pick("Sweets", "Kesari bath")];
  assert.deepEqual(
    fittingPackages([silver, gold, buffet], plan).map(({ name }) => name),
    ["Gold plate", "Buffet"],
  );
});

test("fittingPackages leaves out a package without one of the dishes", () => {
  const { silver, gold } = daawatPackages();
  const small: CateringPackage = {
    ...gold,
    name: "Small plate",
    categories: gold.categories.map((category) => ({
      ...category,
      dishes: category.dishes.slice(0, 1),
    })),
  };
  assert.deepEqual(
    fittingPackages([silver, small], silverPlan).map(({ name }) => name),
    ["Silver plate"],
  );
});

test("food types: Daawat is veg, not non-veg, and Jain only for the free buffet", () => {
  const { silver, gold, buffet } = daawatPackages();
  for (const pkg of [silver, gold, buffet]) {
    assert.equal(matchesFoodType(pkg, "veg"), true, pkg.name);
    assert.equal(matchesFoodType(pkg, "non_veg"), false, pkg.name);
    assert.equal(matchesFoodType(pkg, "mixed"), true, pkg.name);
  }
  assert.equal(matchesFoodType(silver, "jain"), false);
  assert.equal(matchesFoodType(gold, "jain"), false);
  assert.equal(matchesFoodType(buffet, "jain"), true);
});

test("one non-veg or egg dish makes a package non-veg and not veg", () => {
  const { silver } = daawatPackages();
  for (const mark of ["non_veg", "egg"] as const) {
    const pkg: CateringPackage = {
      ...silver,
      categories: silver.categories.map((category, index) =>
        index === 1
          ? {
              ...category,
              dishes: [
                ...category.dishes,
                {
                  id: crypto.randomUUID(),
                  name: "Chicken 65",
                  veg_mark: mark,
                  jain: false,
                },
              ],
            }
          : category,
      ),
    };
    assert.equal(matchesFoodType(pkg, "non_veg"), true, mark);
    assert.equal(matchesFoodType(pkg, "veg"), false, mark);
  }
});

test("Jain needs enough Jain dishes in each category with a minimum", () => {
  const pkg = withIds({
    kind: "plate",
    name: "Jain plate",
    price: 40_000,
    min_count: 50,
    free_choice: false,
    max_total: null,
    service_styles: ["delivery"],
    style_extras: { staff: 0, live_counters: 0 },
    categories: [
      {
        name: "Sweets",
        min: 2,
        max: 2,
        dishes: [
          { name: "Payasam", veg_mark: "veg", jain: true },
          { name: "Mysore pak", veg_mark: "veg", jain: true },
        ],
      },
      {
        name: "Starters",
        min: 0,
        max: 2,
        dishes: [{ name: "Gobi manchurian", veg_mark: "veg", jain: false }],
      },
    ],
  });
  assert.equal(matchesFoodType(pkg, "jain"), true);
  const short: CateringPackage = {
    ...pkg,
    categories: pkg.categories.map((category, index) =>
      index === 0
        ? {
            ...category,
            dishes: category.dishes.map((dish, at) =>
              at === 0 ? { ...dish, jain: false } : dish,
            ),
          }
        : category,
    ),
  };
  assert.equal(matchesFoodType(short, "jain"), false);
});
