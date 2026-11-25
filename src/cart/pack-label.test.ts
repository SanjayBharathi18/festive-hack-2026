import assert from "node:assert/strict";
import { test } from "node:test";
import hi from "../text/hi.json" with { type: "json" };
import { createText } from "../text/text.ts";
import { packLabel } from "./pack-label.ts";

test("a weight reads in g or kg, a count in the buyer's language", () => {
  const en = createText("en");
  assert.equal(
    packLabel({ label: "250 g", grams: 250, pieces: null }, en),
    "250 g",
  );
  assert.equal(
    packLabel({ label: "1 kg", grams: 1000, pieces: null }, en),
    "1 kg",
  );
  assert.equal(
    packLabel({ label: "6 pieces", grams: 240, pieces: 6 }, en),
    "6 pieces",
  );
  assert.equal(
    packLabel({ label: "1 piece", grams: null, pieces: 1 }, en),
    "1 piece",
  );
  assert.equal(
    packLabel(
      { label: "6 pieces", grams: null, pieces: 6 },
      createText("hi", hi),
    ),
    createText("hi", hi).pieces(6),
  );
});

test("a pack with neither a weight nor a count keeps her own label", () => {
  assert.equal(
    packLabel(
      { label: "Family box", grams: null, pieces: null },
      createText("en"),
    ),
    "Family box",
  );
});
