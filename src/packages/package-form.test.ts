import assert from "node:assert/strict";
import { test } from "node:test";
import type { CateringPackage } from "../../shared/catering.ts";
import { createText } from "../text/text.ts";
import {
  emptyPackage,
  problemWords,
  readPackageForm,
  valuesOfPackage,
  type PackageValues,
} from "./package-form.ts";

const silver: PackageValues = {
  kind: "plate",
  name: " Silver plate ",
  price: "350",
  onRequest: false,
  minCount: "100",
  freeChoice: false,
  maxTotal: "9",
  styles: ["delivery", "staff"],
  staffExtra: "40",
  countersExtra: "75",
  categories: [
    {
      name: "Sweets",
      min: "1",
      max: "2",
      dishes: [
        { name: "Gulab jamun", mark: "veg", jain: true },
        { name: " ", mark: "veg", jain: false },
        { name: "Mysore pak", mark: "veg", jain: true },
      ],
    },
    {
      name: "",
      min: "",
      max: "",
      dishes: [{ name: "", mark: "veg", jain: false }],
    },
    {
      name: "Starters",
      min: "",
      max: "",
      dishes: [{ name: "Chicken 65", mark: "non_veg", jain: false }],
    },
  ],
};

test("the editor gives a package, in paise, without empty rows", () => {
  const result = readPackageForm(silver);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(result.input, {
    kind: "plate",
    name: "Silver plate",
    price: 35_000,
    min_count: 100,
    free_choice: false,
    max_total: 9,
    service_styles: ["delivery", "staff"],
    style_extras: { staff: 4_000, live_counters: 0 },
    categories: [
      {
        name: "Sweets",
        min: 1,
        max: 2,
        dishes: [
          { name: "Gulab jamun", veg_mark: "veg", jain: true },
          { name: "Mysore pak", veg_mark: "veg", jain: true },
        ],
      },
      {
        name: "Starters",
        min: 0,
        max: null,
        dishes: [{ name: "Chicken 65", veg_mark: "non_veg", jain: false }],
      },
    ],
  });
});

test("price on request and free choice drop the price and the limits", () => {
  const result = readPackageForm({
    ...silver,
    kind: "buffet",
    onRequest: true,
    price: "abc",
    freeChoice: true,
    maxTotal: "2",
  });
  assert.ok(result.ok);
  assert.equal(result.input.price, null);
  assert.equal(result.input.kind, "buffet");
  assert.equal(result.input.max_total, null);
  assert.deepEqual(
    result.input.categories.map(({ min, max }) => [min, max]),
    [
      [0, null],
      [0, null],
    ],
  );
});

test("each problem comes in the order of the form", () => {
  const sweets = silver.categories[0]!;
  const cases: [Partial<PackageValues>, string][] = [
    [{ name: "" }, "name"],
    [{ price: "" }, "price"],
    [{ price: "3.5" }, "price"],
    [{ minCount: "0" }, "min_count"],
    [{ styles: [] }, "styles"],
    [{ staffExtra: "4.5" }, "extra"],
    [{ staffExtra: "-5" }, "extra"],
    [{ styles: ["live_counters"], countersExtra: "20000" }, "extra"],
    [{ categories: [] }, "category"],
    [{ categories: [{ ...sweets, name: "" }] }, "category"],
    [{ categories: [{ ...sweets, min: "3", max: "2" }] }, "limits"],
    [{ categories: [{ ...sweets, min: "5", max: "" }] }, "limits"],
    [
      {
        categories: [
          { ...sweets, dishes: [{ name: "Payasam", mark: "egg", jain: true }] },
        ],
      },
      "jain",
    ],
    [
      {
        categories: [
          {
            ...sweets,
            dishes: [
              { name: "Payasam", mark: "veg", jain: false },
              { name: "payasam", mark: "veg", jain: false },
            ],
          },
        ],
      },
      "names",
    ],
    [{ categories: [sweets, { ...sweets, name: "SWEETS" }] }, "names"],
    [{ maxTotal: "0" }, "total"],
  ];
  for (const [change, problem] of cases) {
    const result = readPackageForm({ ...silver, ...change });
    assert.equal(result.ok, false, JSON.stringify(change));
    assert.equal(!result.ok && result.problem, problem, JSON.stringify(change));
  }
});

test("a problem in a category names the category and points at its field", () => {
  const text = createText("en");
  const sweets = silver.categories[0]!;
  const breads = { ...sweets, name: "Breads", min: "3", max: "2" };
  const values = { ...silver, categories: [sweets, breads] };
  const limits = readPackageForm(values);
  assert.ok(!limits.ok);
  assert.deepEqual(limits.at, { category: 1, field: "min" });
  assert.equal(
    problemWords(limits, values, text),
    "In Breads, the most is at least the fewest, and there are enough dishes for the fewest.",
  );
  const unnamed = { ...silver, categories: [sweets, { ...sweets, name: "" }] };
  const noName = readPackageForm(unnamed);
  assert.ok(!noName.ok);
  assert.deepEqual(noName.at, { category: 1, field: "name" });
  assert.equal(problemWords(noName, unnamed, text), "Category 2 needs a name.");
  const twice = {
    ...silver,
    categories: [sweets, { ...sweets, name: "SWEETS" }],
  };
  const same = readPackageForm(twice);
  assert.ok(!same.ok);
  assert.equal(
    problemWords(same, twice, text),
    "Another category is also named SWEETS. Give each category its own name.",
  );
  const jain = {
    ...silver,
    categories: [
      {
        ...sweets,
        dishes: [
          { name: "Payasam", mark: "veg", jain: true },
          { name: "Egg halwa", mark: "egg", jain: true },
        ],
      },
    ],
  };
  const egg = readPackageForm(jain);
  assert.ok(!egg.ok);
  assert.deepEqual(egg.at, { category: 0, field: "mark", dish: 1 });
  const name = readPackageForm({ ...silver, name: " " });
  assert.ok(!name.ok);
  assert.deepEqual(name.at, { field: "name" });
  assert.equal(
    problemWords(name, silver, text),
    "Enter the name of the package.",
  );
});

test("a package fills the editor back, and a new package has one empty category", () => {
  const read = readPackageForm(silver);
  assert.ok(read.ok);
  const pkg: CateringPackage = {
    ...read.input,
    id: "00000000-0000-4000-8000-000000000001",
    categories: read.input.categories.map((category, index) => ({
      ...category,
      id: `00000000-0000-4000-8000-00000000001${index}`,
      dishes: category.dishes.map((dish, at) => ({
        ...dish,
        id: `00000000-0000-4000-8000-0000000001${index}${at}`,
      })),
    })),
  };
  const values = valuesOfPackage(pkg);
  assert.equal(values.price, "350");
  assert.equal(values.staffExtra, "40");
  assert.equal(values.countersExtra, "", "an extra of 0 shows empty");
  assert.equal(values.categories[1]?.max, "");
  assert.deepEqual(readPackageForm(values), read);
  assert.equal(emptyPackage().categories.length, 1);
  assert.deepEqual(readPackageForm(emptyPackage()), {
    ok: false,
    problem: "name",
    at: { field: "name" },
  });
});
