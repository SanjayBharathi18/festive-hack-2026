import assert from "node:assert/strict";
import { test } from "node:test";
import type { z } from "zod";
import {
  cartLineSchema,
  dayCheckSchema,
  dayReasonSchema,
  daysRequestSchema,
  daysResponseSchema,
  menuItemSchema,
  menuSectionSchema,
  packSchema,
  publicStoreSchema,
  storeDaysSchema,
  storePageFlagsSchema,
  storePageSchema,
  storeRatingSchema,
} from "./store.ts";

const pack = {
  id: "0c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d5",
  label: "1 kg",
  grams: 1000,
  pieces: null,
  price: 88000,
};

const item = {
  id: "0c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d6",
  name: "ಮೈಸೂರು ಪಾಕ್",
  name_latin: "Mysore pak",
  name_script: null,
  category: "sweets",
  veg_mark: "veg",
  allergens: ["dairy"],
  box_contents: null,
  photo: null,
  special: false,
  sold_out: false,
  packs: [pack],
};

const store = {
  id: "0c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d7",
  slug: "shobhas-kitchen",
  name: "Shobha's Kitchen",
  cover_photo: null,
  area: "Basavanagudi",
  city: "Bengaluru",
  offers_pickup: true,
  offers_delivery: true,
  accepts_online: true,
  advance_for_strangers: false,
  fssai: "00000000000000",
  is_demo: true,
  paused: false,
  normal_orders_on: true,
};

const days = {
  today: "2026-11-24",
  working_days: [0, 1, 2, 3, 4, 5, 6],
  closed_dates: ["2026-11-29"],
  last_order_day: null,
  next_free_day: "2026-11-24",
};

const check = {
  day: "2026-11-28",
  fits: false,
  reason: "not_enough_space",
  space_left: 2000,
};

const cases: [string, z.ZodType, unknown, unknown][] = [
  ["pack", packSchema, pack, { ...pack, price: 880.5 }],
  ["menu item", menuItemSchema, item, { ...item, veg_mark: "vegan" }],
  [
    "menu section",
    menuSectionSchema,
    { category: "sweets", items: [item] },
    { category: "sweets", items: [] },
  ],
  ["public store", publicStoreSchema, store, { ...store, fssai: "123" }],
  ["store days", storeDaysSchema, days, { ...days, working_days: [7] }],
  [
    "store page flags",
    storePageFlagsSchema,
    { ops_voice: false },
    { ops_voice: "off" },
  ],
  [
    "store page",
    storePageSchema,
    {
      store,
      rating: { average: 4.6, count: 128 },
      sections: [{ category: "sweets", items: [item] }],
      days,
      flags: { ops_voice: true },
      recorded: true,
    },
    { store, rating: null, sections: [], days },
  ],
  [
    "store rating",
    storeRatingSchema,
    { average: 4.6, count: 128 },
    { average: 5.2, count: 0 },
  ],
  [
    "cart line",
    cartLineSchema,
    { pack_id: pack.id, quantity: 2 },
    { pack_id: pack.id, quantity: 0 },
  ],
  [
    "days request",
    daysRequestSchema,
    { store_id: store.id, cart: [] },
    { store_id: "shobhas-kitchen", cart: [] },
  ],
  ["day reason", dayReasonSchema, "full", "busy"],
  ["day check", dayCheckSchema, check, { ...check, space_left: -1 }],
  [
    "days response",
    daysResponseSchema,
    {
      today: "2026-11-24",
      limit_unit: "kg",
      cart_load: 3000,
      days: [check],
      next_free_day: "2026-11-29",
    },
    {
      today: "2026-11-24",
      limit_unit: "kg",
      cart_load: 3000,
      days: [],
      next_free_day: null,
    },
  ],
];

for (const [name, schema, valid, invalid] of cases) {
  test(`the ${name} schema takes a valid value and refuses an invalid one`, () => {
    assert.equal(schema.safeParse(valid).success, true);
    assert.equal(schema.safeParse(invalid).success, false);
  });
}
