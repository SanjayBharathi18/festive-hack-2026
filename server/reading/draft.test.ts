import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDraft, draftTotal, emptyDraft } from "./draft.ts";
import type { ReadingItem } from "./menu.ts";
import { maxSearchSteps } from "./packs.ts";
import type { Reading } from "./prompt.ts";
import { heroMenu, menu } from "./test-menu.ts";

const today = "2026-11-24";

type ReadItem = Reading["items"][number];

function item(
  menu_name: string | null,
  said: string,
  quantity: number | null,
  unit: ReadItem["unit"],
  pack_grams: number | null = null,
): ReadItem {
  return { menu_name, said, quantity, unit, pack_grams, pack_pieces: null };
}

function reading(items: ReadItem[], extra: Partial<Reading> = {}): Reading {
  return {
    items,
    day: "saturday",
    date: null,
    buyer_name: " ಪ್ರಿಯಾ ",
    fulfilment: "delivery",
    address: "ಜಯನಗರ",
    note: "  ",
    ...extra,
  };
}

test("each item is matched to the menu, with the fewest packs for its amount", () => {
  const draft = buildDraft(
    menu,
    reading([
      item("Mysore pak", "ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್", 1, "kg"),
      item("Chakkuli", "ಅರ್ಧ ಕೆಜಿ ಚಕ್ಕುಲಿ", 0.5, "kg"),
    ]),
    today,
  );
  const [mysorePak, chakkuli] = draft.items;
  assert.equal(mysorePak?.item_id, heroMenu.mysorePak.id);
  assert.equal(mysorePak?.name, "ಮೈಸೂರು ಪಾಕ್");
  assert.equal(mysorePak?.said, "ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್");
  assert.deepEqual(mysorePak?.packs, [
    {
      pack_id: heroMenu.mysorePak.packs[2]!.id,
      label: "1 kg",
      quantity: 1,
      price: 88_000,
      grams: 1000,
      pieces: null,
    },
  ]);
  assert.equal(chakkuli?.packs[0]?.label, "500 g");
  assert.equal(mysorePak?.near_amount, false);
  assert.equal(mysorePak?.near_name, false);
  assert.equal(draft.total, 88_000 + 20_000);
  assert.equal(draft.day, "2026-11-28");
  assert.equal(draft.buyer_name, "ಪ್ರಿಯಾ");
  assert.equal(draft.fulfilment, "delivery");
  assert.equal(draft.address, "ಜಯನಗರ");
  assert.equal(draft.note, null);
  assert.deepEqual(draft.unmatched, []);
});

test("an amount that no packs make gets the nearest packs, marked", () => {
  const draft = buildDraft(
    menu,
    reading([item("Chakkuli", "Three hundred grams of chakli", 300, "g")]),
    today,
  );
  assert.equal(draft.items[0]?.packs[0]?.label, "250 g");
  assert.equal(draft.items[0]?.near_amount, true);
  assert.deepEqual(draft.items[0]?.asked, {
    quantity: 300,
    unit: "g",
    pack_grams: null,
    pack_pieces: null,
  });
});

test("a name that is only close to the menu is marked as a near match", () => {
  const draft = buildDraft(
    menu,
    reading([item(null, "chakkli", 1, "kg")]),
    today,
  );
  assert.equal(draft.items[0]?.item_id, heroMenu.chakkuli.id);
  assert.equal(draft.items[0]?.near_name, true);
});

test("an item that is not on the menu is listed apart, with what was asked", () => {
  const draft = buildDraft(
    menu,
    reading([item(null, "ಎರಡು ಕೆಜಿ ಜಿಲೇಬಿ", 2, "kg")]),
    today,
  );
  assert.deepEqual(draft.items, []);
  assert.deepEqual(draft.unmatched, [
    {
      said: "ಎರಡು ಕೆಜಿ ಜಿಲೇಬಿ",
      asked: { quantity: 2, unit: "kg", pack_grams: null, pack_pieces: null },
    },
  ]);
  assert.equal(draft.total, 0);
});

test("the same item twice becomes one item", () => {
  const draft = buildDraft(
    menu,
    reading([
      item("Kodubale", "1 kg kodubale", 1, "kg"),
      item("Kodubale", "one more kilo of kodubale", 1, "kg"),
      item("Kodubale", "and 250 g", 250, "g"),
    ]),
    today,
  );
  assert.equal(draft.items.length, 1);
  assert.deepEqual(
    draft.items[0]?.packs.map(
      ({ label, quantity }) => `${quantity} × ${label}`,
    ),
    ["2 × 1 kg", "1 × 250 g"],
  );
  assert.equal(
    draft.items[0]?.said,
    "1 kg kodubale, one more kilo of kodubale, and 250 g",
  );
});

test("packs of a given size are rounded to whole sizes", () => {
  const draft = buildDraft(
    menu,
    reading([
      item(
        "Diwali assorted box",
        "two boxes, half a kilo each",
        2,
        "packs",
        500.4,
      ),
    ]),
    today,
  );
  assert.deepEqual(
    draft.items[0]?.packs.map(
      ({ label, quantity }) => `${quantity} × ${label}`,
    ),
    ["2 × 500 g"],
  );
  assert.equal(draft.items[0]?.asked.pack_grams, 500);
});

test("a sold-out item stays in the draft, marked, but not in the total", () => {
  const soldOut = menu.map((entry) =>
    entry.id === heroMenu.kajuKatli.id ? { ...entry, sold_out: true } : entry,
  );
  const draft = buildDraft(
    soldOut,
    reading([
      item("Kaju katli", "1 kg kaju katli", 1, "kg"),
      item("Nippattu", "1 kg nippattu", 1, "kg"),
    ]),
    today,
  );
  assert.equal(draft.items[0]?.sold_out, true);
  assert.equal(draft.total, 40_000);
  assert.equal(draftTotal(draft.items), 40_000);
});

test("the empty draft has nothing in it", () => {
  assert.deepEqual(emptyDraft(), {
    items: [],
    unmatched: [],
    day: null,
    fulfilment: null,
    buyer_name: null,
    address: null,
    note: null,
    total: 0,
  });
});

test("the largest reading the schema allows stays fast, with any pack sizes", () => {
  const edge = (Math.floor(maxSearchSteps / 3) - 2) / 4;
  const cases: [number[], number][] = [
    [[250, 500, 1000], edge],
    [[333, 500, 1000], 1000],
    [[45, 500, 1000], 1000],
    [[1, 500, 1000], 1000],
  ];
  for (const [sizes, kilos] of cases) {
    const odd: ReadingItem = {
      id: "00000000-0000-4000-8000-0000000000aa",
      name: "x",
      name_latin: null,
      sold_out: false,
      packs: sizes.map((grams, index) => ({
        id: `00000000-0000-4000-8000-00000000010${index}`,
        label: `${grams} g`,
        grams,
        pieces: null,
        price: grams,
      })),
    };
    const start = performance.now();
    const draft = buildDraft(
      [odd],
      reading(Array.from({ length: 30 }, () => item("x", "x", kilos, "kg"))),
      today,
    );
    const took = performance.now() - start;
    assert.ok(took < 250, `${sizes.join("/")}: ${Math.round(took)} ms`);
    assert.ok(draft.items[0]?.packs.every(({ quantity }) => quantity <= 999));
  }
});
