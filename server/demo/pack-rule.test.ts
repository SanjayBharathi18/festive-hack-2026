import assert from "node:assert/strict";
import { test } from "node:test";
import { kiloPacks, piecePacks } from "./pack-rule.ts";

test("a price per kg makes 250 g, 500 g and 1 kg packs at that rate", () => {
  assert.deepEqual(kiloPacks(40000), [
    { label: "250 g", grams: 250, pieces: null, price: 10000 },
    { label: "500 g", grams: 500, pieces: null, price: 20000 },
    { label: "1 kg", grams: 1000, pieces: null, price: 40000 },
  ]);
  assert.deepEqual(
    kiloPacks(45000).map(({ price }) => price),
    [11500, 22500, 45000],
  );
});

test("a price per piece makes packs of 1, 6 and 12 pieces", () => {
  assert.deepEqual(piecePacks(2500), [
    { label: "1 piece", grams: null, pieces: 1, price: 2500 },
    { label: "6 pieces", grams: null, pieces: 6, price: 15000 },
    { label: "12 pieces", grams: null, pieces: 12, price: 30000 },
  ]);
});

test("a piece with a weight gives each pack its weight", () => {
  assert.deepEqual(
    piecePacks(3000, 30).map(({ grams }) => grams),
    [30, 180, 360],
  );
});
