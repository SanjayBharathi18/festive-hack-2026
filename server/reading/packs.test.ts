import assert from "node:assert/strict";
import { test } from "node:test";
import type { Asked } from "../../shared/reading.ts";
import type { ReadingPack } from "./menu.ts";
import { choosePacks, largestFirst, maxPackCount } from "./packs.ts";
import { gujiya, heroMenu } from "./test-menu.ts";

const kilo = heroMenu.chakkuli.packs;
const boxes = heroMenu.diwaliBox.packs;

function asked(
  quantity: number | null,
  unit: Asked["unit"],
  pack_grams: number | null = null,
  pack_pieces: number | null = null,
): Asked {
  return { quantity, unit, pack_grams, pack_pieces };
}

function picked(packs: readonly ReadingPack[], request: Asked) {
  const choice = choosePacks(packs, request);
  assert.ok(choice);
  return {
    packs: choice.packs.map(
      ({ pack, quantity }) => `${quantity} × ${pack.label}`,
    ),
    near: choice.near,
  };
}

test("each amount gets the fewest packs that make it", () => {
  assert.deepEqual(picked(kilo, asked(2, "kg")), {
    packs: ["2 × 1 kg"],
    near: false,
  });
  assert.deepEqual(picked(kilo, asked(1.5, "kg")), {
    packs: ["1 × 1 kg", "1 × 500 g"],
    near: false,
  });
  assert.deepEqual(picked(kilo, asked(0.25, "kg")), {
    packs: ["1 × 250 g"],
    near: false,
  });
  assert.deepEqual(picked(kilo, asked(750, "g")), {
    packs: ["1 × 500 g", "1 × 250 g"],
    near: false,
  });
  assert.deepEqual(picked(kilo, asked(3, "kg")), {
    packs: ["3 × 1 kg"],
    near: false,
  });
});

test("with equal pack counts, the cheaper packs win", () => {
  const packs: ReadingPack[] = [
    { id: "a", label: "200 g", grams: 200, pieces: null, price: 100 },
    { id: "b", label: "400 g", grams: 400, pieces: null, price: 1000 },
    { id: "c", label: "600 g", grams: 600, pieces: null, price: 100 },
  ];
  assert.deepEqual(picked(packs, asked(800, "g")).packs, [
    "1 × 600 g",
    "1 × 200 g",
  ]);
  assert.deepEqual(picked(packs, asked(1200, "g")).packs, ["2 × 600 g"]);
});

test("when no packs make the amount, the nearest packs are marked", () => {
  assert.deepEqual(picked(kilo, asked(300, "g")), {
    packs: ["1 × 250 g"],
    near: true,
  });
  assert.deepEqual(picked(kilo, asked(100, "g")), {
    packs: ["1 × 250 g"],
    near: true,
  });
  assert.deepEqual(picked(kilo, asked(1.1, "kg")), {
    packs: ["1 × 1 kg"],
    near: true,
  });
});

test("a tie between a smaller and a larger total takes the smaller", () => {
  assert.deepEqual(picked(kilo, asked(375, "g")), {
    packs: ["1 × 250 g"],
    near: true,
  });
});

test("pieces use the pieces of each pack", () => {
  assert.deepEqual(picked(gujiya.packs, asked(18, "pieces")), {
    packs: ["1 × 12 pieces", "1 × 6 pieces"],
    near: false,
  });
  assert.deepEqual(picked(gujiya.packs, asked(10, "pieces")), {
    packs: ["1 × 6 pieces", "4 × 1 piece"],
    near: false,
  });
});

test("an amount in a unit that the packs do not have is marked", () => {
  assert.deepEqual(picked(gujiya.packs, asked(1, "kg")), {
    packs: ["1 × 1 piece"],
    near: true,
  });
  assert.deepEqual(picked(kilo, asked(6, "pieces")), {
    packs: ["1 × 250 g"],
    near: true,
  });
});

test("no amount gives the smallest pack, marked", () => {
  assert.deepEqual(picked(kilo, asked(null, "kg")), {
    packs: ["1 × 250 g"],
    near: true,
  });
});

test("packs of a given size count the packs", () => {
  assert.deepEqual(picked(boxes, asked(2, "packs", 500)), {
    packs: ["2 × 500 g"],
    near: false,
  });
  assert.deepEqual(picked(boxes, asked(1, "packs", 1000)), {
    packs: ["1 × 1 kg"],
    near: false,
  });
  assert.deepEqual(picked(gujiya.packs, asked(2, "packs", null, 6)), {
    packs: ["2 × 6 pieces"],
    near: false,
  });
});

test("packs of a size that the menu does not have, or of no size, are marked", () => {
  assert.deepEqual(picked(boxes, asked(2, "packs", 750)), {
    packs: ["2 × 500 g"],
    near: true,
  });
  assert.deepEqual(picked(boxes, asked(1, "packs")), {
    packs: ["1 × 500 g"],
    near: true,
  });
  assert.deepEqual(picked([boxes[1]!], asked(3, "packs")), {
    packs: ["3 × 1 kg"],
    near: false,
  });
  assert.deepEqual(picked(boxes, asked(1.5, "packs", 1000)), {
    packs: ["2 × 1 kg"],
    near: true,
  });
});

test("a huge amount is capped and marked", () => {
  const choice = choosePacks(kilo, asked(1000, "kg"));
  assert.ok(choice?.near);
  assert.ok(choice.packs.every(({ quantity }) => quantity <= maxPackCount));
  assert.equal(choosePacks([], asked(1, "kg")), undefined);
});

test("an amount too large to search takes the largest packs first, marked only when it misses", () => {
  const odd: ReadingPack[] = [333, 500, 1000].map((grams) => ({
    id: String(grams),
    label: grams === 1000 ? "1 kg" : `${grams} g`,
    grams,
    pieces: null,
    price: grams,
  }));
  assert.deepEqual(picked(odd, asked(50, "kg")), {
    packs: ["50 × 1 kg"],
    near: false,
  });
  assert.deepEqual(picked(odd, asked(50.1, "kg")), {
    packs: ["50 × 1 kg"],
    near: true,
  });
  assert.deepEqual(picked(odd, asked(50.2, "kg")), {
    packs: ["50 × 1 kg", "1 × 333 g"],
    near: true,
  });
  const sized = odd.map((pack) => ({ pack, size: pack.grams ?? 0 }));
  assert.deepEqual(
    largestFirst(sized, 100).packs.map(
      ({ pack, quantity }) => `${quantity} × ${pack.label}`,
    ),
    ["1 × 333 g"],
  );
});
