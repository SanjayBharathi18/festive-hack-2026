import assert from "node:assert/strict";
import { test } from "node:test";
import type { ItemReading } from "../../shared/reading.ts";
import {
  checkFields,
  formOfReading,
  isFilled,
  itemOfReading,
  missingFields,
} from "./item-fill.ts";

const chakkuli = (overrides: Partial<ItemReading> = {}): ItemReading => ({
  name: "ಚಕ್ಕುಲಿ",
  name_latin: "Chakkuli",
  category: "savouries",
  veg_mark: "veg",
  price: { per: "kg", amount: 40_000 },
  packs: [
    { label: "250 g", grams: 250, pieces: null, price: 10_000 },
    { label: "500 g", grams: 500, pieces: null, price: 20_000 },
    { label: "1 kg", grams: 1000, pieces: null, price: 40_000 },
  ],
  allergens: [],
  ...overrides,
});

const ids = () => {
  let next = 0;
  return () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;
};

test("the check list has a row for each value, and the Latin name only for another script", () => {
  assert.deepEqual(checkFields(chakkuli()), [
    "name",
    "latin",
    "category",
    "mark",
    "price",
    "packs",
    "allergens",
  ]);
  assert.equal(
    checkFields(chakkuli({ name: "Kaju katli" })).includes("latin"),
    false,
  );
});

test("a value is filled when the reading gives it", () => {
  const reading = chakkuli({ veg_mark: null });
  assert.equal(isFilled(reading, "name"), true);
  assert.equal(isFilled(reading, "mark"), false);
  assert.equal(isFilled(reading, "allergens"), false);
  assert.equal(
    isFilled(chakkuli({ allergens: ["sesame"] }), "allergens"),
    true,
  );
});

test("the values that an item needs and the reading misses, with the price for missing packs", () => {
  assert.deepEqual(missingFields(chakkuli()), []);
  assert.deepEqual(
    missingFields(chakkuli({ category: null, price: null, packs: [] })),
    ["category", "price"],
  );
});

test("the reading fills the item form, with the price in rupees", () => {
  assert.deepEqual(formOfReading(chakkuli({ allergens: ["sesame"] })), {
    name: "ಚಕ್ಕುಲಿ",
    nameLatin: "Chakkuli",
    category: "savouries",
    vegMark: "veg",
    rupees: "400",
    per: "kg",
    allergens: ["sesame"],
  });
  assert.deepEqual(
    formOfReading(
      chakkuli({
        name: null,
        name_latin: null,
        category: null,
        veg_mark: null,
        price: null,
        packs: [],
      }),
    ),
    {
      name: "",
      nameLatin: "",
      category: "",
      vegMark: "",
      rupees: "",
      per: "kg",
      allergens: [],
    },
  );
});

test("a full reading gives the item with its packs and allergens, and a short one gives none", () => {
  const item = itemOfReading(chakkuli({ allergens: ["sesame"] }), {
    id: "0b6a9c1e-2d3f-4a5b-8c7d-9e0f1a2b3c4d",
    newId: ids(),
  });
  assert.deepEqual(item, {
    id: "0b6a9c1e-2d3f-4a5b-8c7d-9e0f1a2b3c4d",
    name: "ಚಕ್ಕುಲಿ",
    name_latin: "Chakkuli",
    category: "savouries",
    veg_mark: "veg",
    box_contents: null,
    allergens: ["sesame"],
    packs: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        label: "250 g",
        grams: 250,
        pieces: null,
        price: 10_000,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        label: "500 g",
        grams: 500,
        pieces: null,
        price: 20_000,
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        label: "1 kg",
        grams: 1000,
        pieces: null,
        price: 40_000,
      },
    ],
  });
  assert.equal(
    itemOfReading(chakkuli({ veg_mark: null }), {
      id: "0b6a9c1e-2d3f-4a5b-8c7d-9e0f1a2b3c4d",
      newId: ids(),
    }),
    undefined,
  );
});

test("pieces keep their counts, and a Latin name keeps no second Latin name", () => {
  const item = itemOfReading(
    chakkuli({
      name: "Besan laddu",
      name_latin: "Besan laddu",
      category: "sweets",
      price: { per: "piece", amount: 2_500 },
      packs: [
        { label: "1 piece", grams: null, pieces: 1, price: 2_500 },
        { label: "6 pieces", grams: null, pieces: 6, price: 15_000 },
      ],
    }),
    { id: "0b6a9c1e-2d3f-4a5b-8c7d-9e0f1a2b3c4d", newId: ids() },
  );
  assert.equal(item?.name_latin, null);
  assert.deepEqual(
    item?.packs.map(({ label, pieces, price }) => [label, pieces, price]),
    [
      ["1 piece", 1, 2_500],
      ["6 pieces", 6, 15_000],
    ],
  );
});
