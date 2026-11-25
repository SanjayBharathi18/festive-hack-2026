import assert from "node:assert/strict";
import { test } from "node:test";
import type { Draft as ReadDraft } from "../../shared/reading.ts";
import type { MenuItem } from "../../shared/store.ts";
import {
  draftFromReading,
  filledFields,
  emptyDraft,
  isEdited,
  itemGroups,
  missing,
  orderFields,
  totalOf,
  valuesFromSlip,
  withPack,
  withQuantity,
} from "./draft.ts";
import { fakeSlip } from "./test-slips.ts";

const mysoreKilo = "5f51e217-1da8-8358-9d21-196f83ea559f";
const mysoreHalf = "ab8f732b-a53f-8810-adf2-ed314bd9cbad";
const chakkuliHalf = "02dadb4d-2ef1-8940-b020-b3f25d919c73";

const asked = { pack_grams: null, pack_pieces: null };

// VK1: Mysore pak 1 kg, chakkuli 500 g, Saturday, Priya, delivery to Jayanagar.
const read: ReadDraft = {
  order_id: "5b100b90-c20d-418e-8c0e-2d593dda1118",
  items: [
    {
      item_id: "086ced7f-5846-8368-9591-69c03683048d",
      name: "ಮೈಸೂರು ಪಾಕ್",
      said: "ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್",
      asked: { ...asked, quantity: 1, unit: "kg" },
      packs: [
        {
          pack_id: mysoreKilo,
          label: "1 kg",
          quantity: 1,
          price: 88_000,
          grams: 1000,
          pieces: null,
        },
      ],
      near_amount: false,
      near_name: false,
      sold_out: false,
    },
    {
      item_id: "4f9f59d3-f7cf-85fe-ade6-078c144790e1",
      name: "ಚಕ್ಕುಲಿ",
      said: "ಅರ್ಧ ಕೆಜಿ ಚಕ್ಕುಲಿ",
      asked: { ...asked, quantity: 0.5, unit: "kg" },
      packs: [
        {
          pack_id: chakkuliHalf,
          label: "500 g",
          quantity: 1,
          price: 21_000,
          grams: 500,
          pieces: null,
        },
      ],
      near_amount: true,
      near_name: false,
      sold_out: false,
    },
  ],
  unmatched: [
    { said: "ಗುಲಾಬ್ ಜಾಮೂನ್", asked: { ...asked, quantity: 1, unit: "kg" } },
  ],
  day: "2026-11-28",
  fulfilment: "delivery",
  buyer_name: "ಪ್ರಿಯಾ",
  address: "ಜಯನಗರ",
  note: null,
  total: 109_000,
  capacity: null,
};

const menu: MenuItem[] = [
  {
    id: "086ced7f-5846-8368-9591-69c03683048d",
    name: "ಮೈಸೂರು ಪಾಕ್",
    name_latin: "Mysore pak",
    name_script: null,
    category: "sweets",
    veg_mark: "veg",
    allergens: [],
    box_contents: null,
    photo: null,
    special: false,
    sold_out: false,
    packs: [
      {
        id: mysoreHalf,
        label: "500 g",
        grams: 500,
        pieces: null,
        price: 45_000,
      },
      {
        id: mysoreKilo,
        label: "1 kg",
        grams: 1000,
        pieces: null,
        price: 88_000,
      },
    ],
  },
];

test("the reading becomes values, and the model's fields are marked", () => {
  const draft = draftFromReading(read);
  assert.equal(draft.initial.lines.length, 2);
  assert.equal(draft.initial.day, "2026-11-28");
  assert.equal(draft.initial.buyer_name, "ಪ್ರಿಯಾ");
  assert.equal(draft.initial.note, "");
  assert.deepEqual([...draft.filled].sort(), [
    "address",
    "buyer_name",
    "day",
    "fulfilment",
    "items",
  ]);
  assert.deepEqual(
    draft.marks.map((mark) => mark.nearAmount),
    [false, true],
  );
  assert.equal(draft.unmatched.length, 1);
  assert.equal(totalOf(draft.initial), 109_000);
});

test("a sold-out item stays out of the cart, as in the draft total", () => {
  const draft = draftFromReading({
    ...read,
    items: read.items.map((item, index) => ({
      ...item,
      sold_out: index === 1,
    })),
  });
  assert.equal(draft.initial.lines.length, 1);
  assert.equal(draft.soldOut[0]?.name, "ಚಕ್ಕುಲಿ");
  assert.equal(totalOf(draft.initial), 88_000);
});

test("an untouched draft is not edited", () => {
  const { initial } = draftFromReading(read);
  assert.equal(isEdited(initial, structuredClone(initial)), false);
});

test("each real change counts as an edit", () => {
  const { initial } = draftFromReading(read);
  assert.equal(isEdited(initial, withQuantity(initial, mysoreKilo, 2)), true);
  assert.equal(isEdited(initial, withPack(initial, menu, mysoreHalf)), true);
  assert.equal(isEdited(initial, { ...initial, day: "2026-11-29" }), true);
  assert.equal(isEdited(initial, { ...initial, fulfilment: "pickup" }), true);
  assert.equal(isEdited(initial, { ...initial, buyer_name: "Priya" }), true);
  assert.equal(isEdited(initial, { ...initial, note: "Less sugar" }), true);
  assert.equal(isEdited(initial, withQuantity(initial, chakkuliHalf, 0)), true);
});

test("filling in a field that the model left empty counts as an edit", () => {
  const { initial } = draftFromReading({ ...read, fulfilment: null });
  assert.equal(isEdited(initial, { ...initial, fulfilment: "pickup" }), true);
});

test("a change taken back, spaces and line order are no edit", () => {
  const { initial } = draftFromReading(read);
  const back = withQuantity(
    withQuantity(initial, mysoreKilo, 3),
    mysoreKilo,
    1,
  );
  assert.equal(isEdited(initial, back), false);
  assert.equal(isEdited(initial, { ...initial, buyer_name: " ಪ್ರಿಯಾ  " }), false);
  assert.equal(
    isEdited(initial, { ...initial, lines: initial.lines.toReversed() }),
    false,
  );
});

test("the address of a pickup order is not part of the order", () => {
  const { initial } = draftFromReading({ ...read, fulfilment: "pickup" });
  assert.equal(
    isEdited(initial, { ...initial, address: "Somewhere else" }),
    false,
  );
});

test("quantities stay from 1 to 999, and 0 takes the line out", () => {
  const { initial } = draftFromReading(read);
  assert.equal(withQuantity(initial, mysoreKilo, 5000).lines[0]?.quantity, 999);
  assert.equal(withQuantity(initial, mysoreKilo, 0).lines.length, 1);
});

test("adding a pack adds one, or one more of a pack in the cart", () => {
  const { initial } = draftFromReading(read);
  const added = withPack(initial, menu, mysoreHalf);
  assert.deepEqual(added.lines.at(-1), {
    item_id: "086ced7f-5846-8368-9591-69c03683048d",
    pack_id: mysoreHalf,
    name: "ಮೈಸೂರು ಪಾಕ್",
    label: "500 g",
    quantity: 1,
    price: 45_000,
    grams: 500,
    pieces: null,
  });
  assert.equal(withPack(initial, menu, mysoreKilo).lines[0]?.quantity, 2);
  assert.equal(withPack(initial, menu, "not-on-the-menu"), initial);
});

test("an order needs items, a day, pickup or delivery, and an address to deliver to", () => {
  assert.deepEqual(missing(emptyDraft().initial), [
    "items",
    "day",
    "fulfilment",
  ]);
  const { initial } = draftFromReading({ ...read, address: null });
  assert.deepEqual(missing(initial), ["address"]);
  assert.equal(orderFields(initial), undefined);
});

test("the order fields are what the server takes", () => {
  const { initial } = draftFromReading(read);
  assert.deepEqual(orderFields({ ...initial, note: "  " }), {
    day: "2026-11-28",
    fulfilment: "delivery",
    address: "ಜಯನಗರ",
    note: null,
    buyer_name: "ಪ್ರಿಯಾ",
    cart: [
      { pack_id: mysoreKilo, quantity: 1 },
      { pack_id: chakkuliHalf, quantity: 1 },
    ],
  });
  assert.equal(
    orderFields({ ...initial, fulfilment: "pickup" })?.address,
    null,
  );
});

test("a slip becomes values to change", () => {
  const values = valuesFromSlip(
    fakeSlip({ buyer_name: null, note: "Less sugar" }),
  );
  assert.equal(values.buyer_name, "");
  assert.equal(values.note, "Less sugar");
  assert.equal(values.lines.length, 1);
});

test("lines group by item for the row that names the item once", () => {
  const { initial } = draftFromReading(read);
  const groups = itemGroups(withPack(initial, menu, mysoreHalf).lines);
  assert.deepEqual(
    groups.map((group) => group.map((line) => line.label)),
    [["1 kg", "500 g"], ["500 g"]],
  );
});

test("the filled fields come in the order of the form, with the items to check marked", () => {
  assert.deepEqual(filledFields(draftFromReading(read)), {
    count: 5,
    notes: 5,
    unsure: [0],
  });
  const sure = draftFromReading({
    ...read,
    items: read.items.map((item) => ({ ...item, near_amount: false })),
    unmatched: [],
  });
  assert.deepEqual(filledFields(sure), { count: 5, notes: 5, unsure: [] });
  assert.deepEqual(filledFields(draftFromReading({ ...read, items: [] })), {
    count: 4,
    notes: 5,
    unsure: [0],
  });
});

test("a needed field not heard and a sold-out item play unsure in the cascade", () => {
  const sure = read.items.map((item) => ({ ...item, near_amount: false }));
  const wayNotSaid = draftFromReading({
    ...read,
    items: sure,
    unmatched: [],
    fulfilment: null,
    address: null,
  });
  assert.deepEqual(filledFields(wayNotSaid), {
    count: 3,
    notes: 4,
    unsure: [2],
  });
  const noAddress = draftFromReading({
    ...read,
    items: sure,
    unmatched: [],
    address: null,
  });
  assert.deepEqual(filledFields(noAddress), {
    count: 4,
    notes: 5,
    unsure: [4],
  });
  const soldOut = draftFromReading({
    ...read,
    items: sure.map((item, index) => ({ ...item, sold_out: index === 1 })),
    unmatched: [],
  });
  assert.deepEqual(filledFields(soldOut), { count: 5, notes: 5, unsure: [0] });
  const allSoldOut = draftFromReading({
    ...read,
    items: sure.map((item) => ({ ...item, sold_out: true })),
    unmatched: [],
  });
  assert.deepEqual(filledFields(allSoldOut), {
    count: 5,
    notes: 5,
    unsure: [0],
  });
});
