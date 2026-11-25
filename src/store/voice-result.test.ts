import assert from "node:assert/strict";
import { test } from "node:test";
import type { CartReading, DraftItem } from "../../shared/reading.ts";
import { emptyCart, quantityOf, setQuantity } from "../cart/cart.ts";
import { createText } from "../text/text.ts";
import {
  applyReading,
  askedWords,
  heardSegments,
  isNear,
} from "./voice-result.ts";

const kilo = "00000000-0000-4000-8000-000000000001";
const quarter = "00000000-0000-4000-8000-000000000002";
const katli = "00000000-0000-4000-8000-000000000003";

test("the heard packs go into the cart, on top of what is there", () => {
  const cart = setQuantity(emptyCart, { id: kilo, price: 88000 }, 1);
  const applied = applyReading(cart, reading());
  assert.equal(quantityOf(applied.cart, kilo), 3);
  assert.equal(quantityOf(applied.cart, quarter), 1);
  assert.equal(quantityOf(applied.cart, katli), 0);
  assert.deepEqual(
    applied.soldOut.map((item) => item.said),
    ["kaju katli"],
  );
  assert.deepEqual(
    applied.unmatched.map((item) => item.said),
    ["jalebi"],
  );
  assert.deepEqual(
    [...applied.marks],
    [
      [kilo, "heard"],
      [quarter, "near"],
    ],
  );
  assert.equal(applied.cart.day, "2026-11-28");
  assert.equal(applied.cart.picked_by, "voice");
});

test("a reading with no day keeps the day of the cart", () => {
  const applied = applyReading(emptyCart, { ...reading(), day: null });
  assert.equal(applied.cart.day, null);
  assert.equal(applied.cart.picked_by, null);
});

test("an item is near when its amount or its name matched only nearly", () => {
  assert.equal(isNear({ near_amount: true, near_name: false }), true);
  assert.equal(isNear({ near_amount: false, near_name: true }), true);
  assert.equal(isNear({ near_amount: false, near_name: false }), false);
});

test("the words of each item are marked in the transcript", () => {
  assert.deepEqual(
    heardSegments("Three hundred grams of chakli for tomorrow, please.", [
      "Three hundred grams of chakli",
    ]),
    [
      { text: "Three hundred grams of chakli", heard: true },
      { text: " for tomorrow, please.", heard: false },
    ],
  );
  assert.deepEqual(
    heardSegments("ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್ ಮತ್ತು ಅರ್ಧ ಕೆಜಿ ಚಕ್ಕುಲಿ ಬೇಕು", [
      "ಅರ್ಧ ಕೆಜಿ ಚಕ್ಕುಲಿ",
      "ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್",
      "not in it",
    ]).map((segment) => segment.heard),
    [true, false, true, false],
  );
});

test("marks that overlap or differ in case join into one", () => {
  assert.deepEqual(
    heardSegments("Two KG kaju katli", ["two kg kaju", "kaju katli"]),
    [{ text: "Two KG kaju katli", heard: true }],
  );
  assert.deepEqual(heardSegments("", ["x"]), []);
});

test("the asked amount reads as the buyer said it", () => {
  const en = createText("en");
  const asked = (
    quantity: number | null,
    unit: "kg" | "g" | "pieces" | "packs",
    grams: number | null = null,
  ) => ({
    quantity,
    unit,
    pack_grams: grams,
    pack_pieces: null,
  });
  assert.equal(askedWords(asked(0.3, "kg"), en), "300 g");
  assert.equal(askedWords(asked(1.5, "kg"), en), "1.5 kg");
  assert.equal(askedWords(asked(300, "g"), en), "300 g");
  assert.equal(askedWords(asked(6, "pieces"), en), "6 pieces");
  assert.equal(askedWords(asked(2, "packs", 500), en), "2 × 500 g");
  assert.equal(askedWords(asked(2, "packs"), en), "2 packs");
  assert.equal(askedWords(asked(null, "kg"), en), null);
});

function reading(): CartReading {
  const item = (
    said: string,
    packs: DraftItem["packs"],
    extra: Partial<DraftItem> = {},
  ): DraftItem => ({
    item_id: crypto.randomUUID(),
    name: said,
    said,
    asked: { quantity: 1, unit: "kg", pack_grams: null, pack_pieces: null },
    packs,
    near_amount: false,
    near_name: false,
    sold_out: false,
    ...extra,
  });
  const pack = (pack_id: string, quantity: number, price: number) => ({
    pack_id,
    label: "1 kg",
    quantity,
    price,
    grams: 1000,
    pieces: null,
  });
  return {
    items: [
      item("two kilo Mysore pak", [pack(kilo, 2, 88000)]),
      item("three hundred grams chakli", [pack(quarter, 1, 11000)], {
        near_amount: true,
      }),
      item("kaju katli", [pack(katli, 1, 128000)], { sold_out: true }),
    ],
    unmatched: [
      {
        said: "jalebi",
        asked: { quantity: 1, unit: "kg", pack_grams: null, pack_pieces: null },
      },
    ],
    day: "2026-11-28",
    total: 2 * 88000 + 11000,
  };
}
