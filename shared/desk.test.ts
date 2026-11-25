import assert from "node:assert/strict";
import { test } from "node:test";
import {
  closedDayAnswerSchema,
  closedDayBodySchema,
  deskStoreSchema,
  pausedSchema,
  soldOutAnswerSchema,
  soldOutBodySchema,
  type DeskStore,
} from "./desk.ts";

const answer: DeskStore = {
  store: {
    id: "0b6f3c3e-7d0a-4b8e-9a51-2f9c1d4e5a60",
    slug: "shobhas-kitchen",
    name: "Shobha's Kitchen",
    area: "Basavanagudi",
    city: "Bengaluru",
    is_demo: true,
    limit_unit: "kg",
    daily_limit: 25000,
    offers_pickup: true,
    offers_delivery: true,
    paused: false,
    bulk_on: false,
    catering_on: false,
    normal_orders_on: true,
  },
  voice_samples: true,
  seller_language: "kn",
  menu: [],
  closed_dates: ["2026-11-29"],
  flags: { ops_voice: true },
  recorded: true,
};

test("a desk store has the store, the seller language, the menu, the closed days, the flags and the mode", () => {
  assert.deepEqual(deskStoreSchema.parse(answer), answer);
  assert.equal(
    deskStoreSchema.safeParse({ ...answer, seller_language: "fr" }).success,
    false,
  );
  assert.equal(
    deskStoreSchema.safeParse({ ...answer, flags: {} }).success,
    false,
  );
  assert.equal(
    deskStoreSchema.safeParse({ ...answer, closed_dates: ["29 Nov"] }).success,
    false,
  );
  const placeless = { ...answer.store, area: null, city: null };
  assert.deepEqual(
    deskStoreSchema.parse({ ...answer, store: placeless }).store,
    placeless,
  );
});

test("a sold-out change names its item and its state", () => {
  assert.deepEqual(soldOutBodySchema.parse({ sold_out: true }), {
    sold_out: true,
  });
  assert.equal(soldOutBodySchema.safeParse({ sold_out: "yes" }).success, false);
  const change = { item_id: answer.store.id, sold_out: false };
  assert.deepEqual(soldOutAnswerSchema.parse(change), change);
  assert.equal(
    soldOutAnswerSchema.safeParse({ ...change, item_id: "mysore-pak" }).success,
    false,
  );
});

test("a pause is on or off", () => {
  assert.deepEqual(pausedSchema.parse({ paused: true }), { paused: true });
  assert.equal(pausedSchema.safeParse({}).success, false);
});

test("a closed day names its day and its state", () => {
  assert.deepEqual(closedDayBodySchema.parse({ closed: true }), {
    closed: true,
  });
  assert.equal(closedDayBodySchema.safeParse({ closed: 1 }).success, false);
  const change = { day: "2026-11-29", closed: true };
  assert.deepEqual(closedDayAnswerSchema.parse(change), change);
  assert.equal(
    closedDayAnswerSchema.safeParse({ ...change, day: "2026-13-01" }).success,
    false,
  );
});
