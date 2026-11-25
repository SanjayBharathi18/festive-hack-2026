import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CateringPackage,
  PlanCheck,
  PlanCheckAnswer,
  PlanDish,
} from "../../shared/catering.ts";
import {
  createPlan,
  eventProblem,
  missingDishes,
  offers,
  overLimits,
  refusalOf,
  type PlanState,
} from "./plan.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function pkg(n: number, name: string, sweetsMax: number): CateringPackage {
  return {
    id: id(n),
    kind: "plate",
    name,
    price: 35_000,
    min_count: 100,
    free_choice: false,
    max_total: 9,
    service_styles: ["delivery"],
    style_extras: { staff: 0, live_counters: 0 },
    categories: [
      {
        id: id(n * 10),
        name: "Sweets",
        min: 1,
        max: sweetsMax,
        dishes: ["Gulab jamun", "Mysore pak", "Payasam"].map((dish, at) => ({
          id: id(n * 100 + at),
          name: dish,
          veg_mark: "veg" as const,
          jain: true,
        })),
      },
    ],
  };
}

const silver = pkg(1, "Silver plate", 2);
const gold = pkg(2, "Gold plate", 3);
const sweet = (dish: string): PlanDish => ({ category: "Sweets", dish });

// A stand-in for POST /api/catering/check: counts the sweets of the package.
function fakeCheck(calls: string[] = []) {
  return async (
    packageId: string,
    dishes: readonly PlanDish[],
  ): Promise<PlanCheckAnswer> => {
    const chosen = packageId === gold.id ? gold : silver;
    calls.push(`${chosen.name}:${dishes.length}`);
    const max = chosen.categories[0]?.max ?? 0;
    const check: PlanCheck = {
      categories: [
        {
          name: "Sweets",
          chosen: dishes.length,
          min: 1,
          max,
          over: dishes.length > max,
          missing: Math.max(0, 1 - dishes.length),
        },
      ],
      total: { chosen: dishes.length, max: 9, over: false },
      unknown: [],
      ok: dishes.length >= 1 && dishes.length <= max,
    };
    const { categories: _, ...offer } = gold;
    return {
      check,
      fitting:
        dishes.length > max && chosen.id === silver.id
          ? [{ ...offer, limits: [{ name: "Sweets", min: 1, max: 3 }] }]
          : [],
    };
  };
}

function plan(calls: string[] = []) {
  const states: PlanState[] = [];
  const made = createPlan({
    packages: [silver, gold],
    packageId: silver.id,
    check: fakeCheck(calls),
    onChange: (state) => states.push(state),
    signal: new AbortController().signal,
  });
  return { made, states };
}

test("picks go in and out, each with a check, and say what they did for the sound", async () => {
  const calls: string[] = [];
  const { made } = plan(calls);
  assert.equal(await made.toggle(sweet("Gulab jamun")), "added");
  assert.equal(await made.toggle(sweet("Mysore pak")), "added");
  assert.equal(made.state.picks.length, 2);
  assert.equal(made.state.check?.ok, true);
  assert.equal(await made.toggle(sweet("Gulab jamun")), "dropped");
  assert.deepEqual(made.state.picks, [sweet("Mysore pak")]);
  assert.deepEqual(calls, [
    "Silver plate:1",
    "Silver plate:2",
    "Silver plate:1",
  ]);
});

test("a third sweet on Silver is refused, with Gold as the package that allows it", async () => {
  const { made } = plan();
  await made.toggle(sweet("Gulab jamun"));
  await made.toggle(sweet("Mysore pak"));
  assert.equal(
    await made.toggle(sweet("Payasam")),
    "refused",
    "a refused dish plays limit, not pick",
  );
  assert.equal(made.state.picks.length, 2);
  assert.deepEqual(made.state.refused?.refusal, {
    kind: "category",
    name: "Sweets",
    max: 2,
  });
  assert.deepEqual(
    made.state.refused?.fitting.map(({ name }) => name),
    ["Gold plate"],
  );
  await made.switchTo(gold.id, true);
  assert.equal(made.state.pkg.name, "Gold plate");
  assert.deepEqual(
    made.state.picks.map(({ dish }) => dish),
    ["Gulab jamun", "Mysore pak", "Payasam"],
  );
  assert.equal(made.state.refused, undefined);
  assert.equal(made.state.check?.ok, true);
});

test("a change to a smaller package checks the picks again and names each limit that they break", async () => {
  const states: PlanState[] = [];
  const made = createPlan({
    packages: [silver, gold],
    packageId: gold.id,
    check: fakeCheck(),
    onChange: (state) => states.push(state),
    signal: new AbortController().signal,
  });
  for (const dish of ["Gulab jamun", "Mysore pak", "Payasam"]) {
    assert.equal(await made.toggle(sweet(dish)), "added");
  }
  await made.switchTo(silver.id, false);
  assert.equal(made.state.pkg.name, "Silver plate");
  assert.equal(made.state.picks.length, 3, "the picks stay for the host");
  assert.equal(made.state.refused, undefined);
  assert.deepEqual(overLimits(made.state.check), [
    { kind: "category", name: "Sweets", max: 2 },
  ]);
  assert.deepEqual(
    made.state.fitting.map(({ name }) => name),
    ["Gold plate"],
  );
  assert.equal(await made.toggle(sweet("Payasam")), "dropped");
  assert.deepEqual(overLimits(made.state.check), []);
  assert.deepEqual(made.state.fitting, []);
});

test("a kept plan comes back with the dishes that its package offers", async () => {
  const states: PlanState[] = [];
  const made = createPlan({
    packages: [silver, gold],
    packageId: gold.id,
    picks: [sweet("Payasam"), { category: "Mains", dish: "Veg kurma" }],
    check: fakeCheck(),
    onChange: (state) => states.push(state),
    signal: new AbortController().signal,
  });
  assert.deepEqual(made.state.picks, [sweet("Payasam")]);
  await made.switchTo(gold.id, false);
  assert.equal(made.state.check?.ok, true);
});

test("quick taps run in order", async () => {
  const { made } = plan();
  await Promise.all([
    made.toggle(sweet("Gulab jamun")),
    made.toggle(sweet("Mysore pak")),
    made.toggle(sweet("Gulab jamun")),
  ]);
  assert.deepEqual(made.state.picks, [sweet("Mysore pak")]);
});

test("a change of package keeps only the dishes that it offers", () => {
  const other: CateringPackage = {
    ...gold,
    categories: [
      {
        ...gold.categories[0]!,
        dishes: gold.categories[0]!.dishes.slice(0, 1),
      },
    ],
  };
  assert.equal(offers(other, sweet("gulab  JAMUN")), true);
  assert.equal(offers(other, sweet("Payasam")), false);
  assert.equal(
    offers(other, { category: "Mains", dish: "Gulab jamun" }),
    false,
  );
});

test("the refusal names the category of the pick, or the total", () => {
  const base: PlanCheck = {
    categories: [
      { name: "Sweets", chosen: 3, min: 1, max: 2, over: true, missing: 0 },
      { name: "Mains", chosen: 1, min: 2, max: 3, over: false, missing: 1 },
    ],
    total: { chosen: 4, max: 9, over: false },
    unknown: [],
    ok: false,
  };
  assert.deepEqual(refusalOf(base, sweet("Payasam")), {
    kind: "category",
    name: "Sweets",
    max: 2,
  });
  const total = {
    ...base,
    categories: base.categories.map((category) => ({
      ...category,
      over: false,
    })),
    total: { chosen: 10, max: 9, over: true },
  };
  assert.deepEqual(refusalOf(total, { category: "Mains", dish: "Dal" }), {
    kind: "total",
    max: 9,
  });
  assert.equal(
    refusalOf({ ...total, total: { ...total.total, over: false } }, sweet("x")),
    undefined,
  );
  assert.deepEqual(missingDishes(base), [{ name: "Mains", count: 1 }]);
  assert.equal(
    refusalOf(base, { category: "Mains", dish: "Dal" }),
    undefined,
    "a category that is over already does not refuse a pick in another",
  );
  assert.deepEqual(overLimits(base), [
    { kind: "category", name: "Sweets", max: 2 },
  ]);
  assert.deepEqual(overLimits(total), [{ kind: "total", max: 9 }]);
  assert.deepEqual(overLimits(undefined), []);
});

test("the event needs guests at the minimum, a free date and a place", () => {
  const rules = {
    today: "2026-11-24",
    booked: new Set(["2026-11-29"]),
    minCount: 100,
  };
  const good = { date: "2026-12-05", guests: 120, place: "Jayanagar" };
  assert.equal(eventProblem(good, rules), undefined);
  assert.equal(
    eventProblem({ ...good, guests: Number.NaN }, rules),
    "guests_missing",
  );
  assert.equal(
    eventProblem({ ...good, guests: 60 }, rules),
    "guests_below_min",
  );
  assert.equal(eventProblem({ ...good, date: "" }, rules), "date_missing");
  assert.equal(
    eventProblem({ ...good, date: "2026-11-20" }, rules),
    "date_past",
  );
  assert.equal(
    eventProblem({ ...good, date: "2026-11-29" }, rules),
    "date_booked",
  );
  assert.equal(eventProblem({ ...good, place: " " }, rules), "place_missing");
});
