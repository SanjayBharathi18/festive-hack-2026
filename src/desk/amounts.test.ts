import assert from "node:assert/strict";
import { test } from "node:test";
import kn from "../text/kn.json" with { type: "json" };
import { createText } from "../text/text.ts";
import {
  amountOf,
  askedAmount,
  madeAmount,
  ordersOf,
  packAmount,
  packsText,
  readout,
} from "./amounts.ts";

const en = createText("en");

test("an amount is in the unit of her limit", () => {
  assert.equal(amountOf("kg", 2000, en), "2 kg");
  assert.equal(amountOf("kg", 750, en), "750 g");
  assert.equal(amountOf("pieces", 12, en), "12 pieces");
  assert.equal(amountOf("orders", 6, en), "6 orders");
  assert.equal(amountOf("orders", 1, en), "1 order");
});

test("orders take the plural of the language, with Latin digits", () => {
  assert.equal(ordersOf(1_200, en), "1,200 orders");
  const kannada = createText("kn", kn);
  assert.match(ordersOf(6, kannada), /^6 /);
});

test("the readout reads like a shop scale", () => {
  assert.equal(readout("kg", 23_000, 25_000), "23 / 25 kg");
  assert.equal(readout("kg", 23_250, 25_000), "23.25 / 25 kg");
  assert.equal(readout("orders", 9, 15), "9 / 15");
});

test("a pack amount shows the count only when there is more than one", () => {
  assert.equal(packAmount(1, "1 kg"), "1 kg");
  assert.equal(packAmount(2, "1 kg"), "2 × 1 kg");
});

test("the packs to make list each pack with its count", () => {
  assert.equal(
    packsText([
      { label: "1 kg", quantity: 5 },
      { label: "500 g", quantity: 1 },
    ]),
    "5 × 1 kg · 1 × 500 g",
  );
});

test("the amount to make joins weight and pieces", () => {
  assert.equal(madeAmount({ grams: 5500, pieces: null }, en), "5.5 kg");
  assert.equal(madeAmount({ grams: null, pieces: 12 }, en), "12 pieces");
  assert.equal(madeAmount({ grams: 500, pieces: 6 }, en), "500 g + 6 pieces");
});

test("the asked amount is what the buyer said", () => {
  const asked = { pack_grams: null, pack_pieces: null };
  assert.equal(
    askedAmount({ ...asked, quantity: 300, unit: "g" }, en),
    "300 g",
  );
  assert.equal(
    askedAmount({ ...asked, quantity: 1.5, unit: "kg" }, en),
    "1.5 kg",
  );
  assert.equal(
    askedAmount({ ...asked, quantity: 2, unit: "pieces" }, en),
    "2 pieces",
  );
  assert.equal(askedAmount({ ...asked, quantity: 2, unit: "packs" }, en), "2");
  assert.equal(askedAmount({ ...asked, quantity: null, unit: "kg" }, en), "");
});
