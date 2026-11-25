import assert from "node:assert/strict";
import { test } from "node:test";
import { strictJsonSchema } from "../sarvam/chat.ts";
import {
  itemAnswerSchema,
  itemOfAnswer,
  itemPrompt,
  type ItemAnswer,
} from "./item.ts";

const answer = (overrides: Partial<ItemAnswer> = {}): ItemAnswer => ({
  name: "Kaju katli",
  name_latin: null,
  category: "sweets",
  veg_mark: "veg",
  price_rupees: 1200,
  price_per: "kg",
  allergens: ["nuts"],
  ...overrides,
});

test("the item schema takes one item, and refuses a price or a name out of range", () => {
  assert.ok(itemAnswerSchema.safeParse(answer()).success);
  assert.ok(
    itemAnswerSchema.safeParse(
      answer({ name: null, price_rupees: null, price_per: null }),
    ).success,
  );
  for (const bad of [
    { price_rupees: 0 },
    { price_rupees: 100_001 },
    { name: "x".repeat(61) },
    { allergens: ["glitter"] },
    { category: "drinks" },
  ]) {
    assert.equal(
      itemAnswerSchema.safeParse({ ...answer(), ...bad }).success,
      false,
      JSON.stringify(bad),
    );
  }
});

test("the strict JSON schema asks for every field, and the prompt lists the allergens", () => {
  const schema = strictJsonSchema(itemAnswerSchema);
  assert.deepEqual(
    new Set(schema.required as string[]),
    new Set(Object.keys(answer())),
  );
  assert.equal(schema.additionalProperties, false);
  assert.match(itemPrompt(), /dairy, nuts, peanuts, sesame/);
});

test("a price a kg gives the packs of the pack rule, each rounded up to the next ₹5", () => {
  const item = itemOfAnswer(answer({ price_rupees: 650 }));
  assert.deepEqual(item.price, { per: "kg", amount: 65_000 });
  assert.deepEqual(
    item.packs.map(({ label, grams, price }) => [label, grams, price]),
    [
      ["250 g", 250, 16_500],
      ["500 g", 500, 32_500],
      ["1 kg", 1000, 65_000],
    ],
  );
});

test("a price a piece gives packs of 1, 6 and 12 pieces", () => {
  const item = itemOfAnswer(answer({ price_rupees: 25, price_per: "piece" }));
  assert.deepEqual(
    item.packs.map(({ pieces, price }) => [pieces, price]),
    [
      [1, 2_500],
      [6, 15_000],
      [12, 30_000],
    ],
  );
});

test("no price gives no packs, and names are trimmed", () => {
  const item = itemOfAnswer(
    answer({ name: "  ", price_rupees: 400, price_per: null }),
  );
  assert.equal(item.name, null);
  assert.equal(item.price, null);
  assert.deepEqual(item.packs, []);
});

test("a name in English letters keeps no Latin name, and another script keeps its Latin name", () => {
  assert.equal(
    itemOfAnswer(answer({ name_latin: "Kaju katli" })).name_latin,
    null,
  );
  assert.equal(
    itemOfAnswer(answer({ name: " ಚಕ್ಕುಲಿ ", name_latin: " Chakkuli " }))
      .name_latin,
    "Chakkuli",
  );
  assert.equal(
    itemOfAnswer(answer({ name: "ಚಕ್ಕುಲಿ", name_latin: "ಚಕ್ಕುಲಿ" })).name_latin,
    null,
  );
});

test("an allergen said twice is listed once", () => {
  assert.deepEqual(
    itemOfAnswer(answer({ allergens: ["nuts", "dairy", "nuts"] })).allergens,
    ["nuts", "dairy"],
  );
});
