import assert from "node:assert/strict";
import { test } from "node:test";
import { isPackUnit, packOfRow, rowOfPack, suggestPacks } from "./packs.ts";

const id = "11111111-1111-4111-8111-111111111111";

test("₹400 a kg gives 250 g ₹100, 500 g ₹200 and 1 kg ₹400 (VS2)", () => {
  assert.deepEqual(suggestPacks(400, "kg"), [
    { amount: 250, unit: "g", rupees: 100 },
    { amount: 500, unit: "g", rupees: 200 },
    { amount: 1, unit: "kg", rupees: 400 },
  ]);
});

test("a weight price rounds up to the next ₹5", () => {
  assert.deepEqual(
    suggestPacks(650, "kg").map((row) => row.rupees),
    [165, 325, 650],
  );
});

test("a piece price gives 1, 6 and 12 pieces", () => {
  assert.deepEqual(suggestPacks(25, "piece"), [
    { amount: 1, unit: "pieces", rupees: 25 },
    { amount: 6, unit: "pieces", rupees: 150 },
    { amount: 12, unit: "pieces", rupees: 300 },
  ]);
});

test("no price gives no packs", () => {
  assert.deepEqual(suggestPacks(0, "kg"), []);
  assert.deepEqual(suggestPacks(Number.NaN, "piece"), []);
});

test("a row becomes a pack in grams or pieces, with its price in paise", () => {
  assert.deepEqual(packOfRow({ amount: 1.5, unit: "kg", rupees: 600 }, id), {
    id,
    label: "1.5 kg",
    grams: 1500,
    pieces: null,
    price: 60_000,
  });
  assert.deepEqual(packOfRow({ amount: 6, unit: "pieces", rupees: 150 }, id), {
    id,
    label: "6 pieces",
    grams: null,
    pieces: 6,
    price: 15_000,
  });
  assert.equal(
    packOfRow({ amount: 1, unit: "pieces", rupees: 25 }, id)?.label,
    "1 piece",
  );
  assert.equal(packOfRow({ amount: 0, unit: "g", rupees: 25 }, id), undefined);
  assert.equal(
    packOfRow({ amount: Number.NaN, unit: "g", rupees: 25 }, id),
    undefined,
  );
});

test("a pack goes back into its row", () => {
  assert.deepEqual(
    rowOfPack({ id, label: "1 kg", grams: 1000, pieces: null, price: 40_000 }),
    { amount: 1, unit: "kg", rupees: 400 },
  );
  assert.deepEqual(
    rowOfPack({ id, label: "250 g", grams: 250, pieces: null, price: 10_000 }),
    { amount: 250, unit: "g", rupees: 100 },
  );
  assert.deepEqual(
    rowOfPack({ id, label: "6 pieces", grams: 240, pieces: 6, price: 15_000 }),
    { amount: 6, unit: "pieces", rupees: 150 },
  );
  assert.ok(isPackUnit("kg"));
  assert.equal(isPackUnit("litre"), false);
});
