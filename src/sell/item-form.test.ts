import assert from "node:assert/strict";
import { test } from "node:test";
import { needsLatin } from "../../shared/setup.ts";
import { itemOfFields, type ItemFields } from "./item-form.ts";

const fields = (overrides: Partial<ItemFields> = {}): ItemFields => ({
  id: "0b6a9c1e-2d3f-4a5b-8c7d-9e0f1a2b3c4d",
  name: " ಚಕ್ಕುಲಿ ",
  nameLatin: "Chakkuli",
  category: "savouries",
  vegMark: "veg",
  box: false,
  boxContents: "",
  allergens: [],
  packs: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      amount: "250",
      unit: "g",
      rupees: "100",
    },
  ],
  ...overrides,
});

test("the form gives her item with its packs", () => {
  assert.deepEqual(itemOfFields(fields()), {
    id: "0b6a9c1e-2d3f-4a5b-8c7d-9e0f1a2b3c4d",
    name: "ಚಕ್ಕುಲಿ",
    name_latin: "Chakkuli",
    category: "savouries",
    veg_mark: "veg",
    box_contents: null,
    allergens: [],
    packs: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        label: "250 g",
        grams: 250,
        pieces: null,
        price: 10_000,
      },
    ],
  });
});

test("the form keeps the allergens that she ticks, and no unknown word", () => {
  assert.deepEqual(
    itemOfFields(fields({ allergens: ["nuts", "dairy", "glitter"] }))
      ?.allergens,
    ["nuts", "dairy"],
  );
});

test("a Latin name keeps no second Latin name", () => {
  assert.equal(
    itemOfFields(fields({ name: "Chakli", nameLatin: "Chakkuli" }))?.name_latin,
    null,
  );
  assert.equal(itemOfFields(fields({ nameLatin: " " }))?.name_latin, null);
});

test("a box needs its contents", () => {
  assert.equal(itemOfFields(fields({ box: true })), undefined);
  assert.equal(
    itemOfFields(fields({ box: true, boxContents: " Mysore pak, kaju katli " }))
      ?.box_contents,
    "Mysore pak, kaju katli",
  );
  assert.equal(
    itemOfFields(fields({ box: false, boxContents: "left over" }))
      ?.box_contents,
    null,
  );
});

test("an item with no pack, a bad pack or no mark is refused", () => {
  assert.equal(itemOfFields(fields({ packs: [] })), undefined);
  assert.equal(
    itemOfFields(
      fields({
        packs: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            amount: "",
            unit: "g",
            rupees: "100",
          },
        ],
      }),
    ),
    undefined,
  );
  assert.equal(
    itemOfFields(
      fields({
        packs: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            amount: "1",
            unit: "litre",
            rupees: "100",
          },
        ],
      }),
    ),
    undefined,
  );
  assert.equal(itemOfFields(fields({ vegMark: "" })), undefined);
  assert.equal(itemOfFields(fields({ name: "  " })), undefined);
});

test("only a name with letters of another script needs English letters", () => {
  assert.ok(needsLatin("ಚಕ್ಕುಲಿ"));
  assert.ok(needsLatin("मैसूर पाक"));
  assert.equal(needsLatin("Mysore pak 2"), false);
  assert.equal(needsLatin("Café"), false);
});
