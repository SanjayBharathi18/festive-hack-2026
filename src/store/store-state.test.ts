import assert from "node:assert/strict";
import { test } from "node:test";
import type { CartReading, DraftItem } from "../../shared/reading.ts";
import type { DaysResponse } from "../../shared/store.ts";
import {
  emptyCart,
  maxQuantity,
  quantityOf,
  setQuantity,
  type Cart,
} from "../cart/cart.ts";
import { createStoreState, type StoreChange } from "./store-state.ts";

const kilo = { id: "00000000-0000-4000-8000-000000000001", price: 88000 };
const half = { id: "00000000-0000-4000-8000-000000000002", price: 21000 };
const today = "2026-11-24";
const saturday = "2026-11-28";

test("each step is saved at once; loading the page saves nothing", () => {
  const { state, saved, changes } = setup();
  assert.equal(saved.length, 0);
  assert.deepEqual(state.step(kilo, 1), { more: true, first: true });
  assert.equal(quantityOf(state.cart, kilo.id), 1);
  assert.equal(saved.length, 1);
  assert.deepEqual(changes.at(-1), { cart: true, days: false });
  assert.deepEqual(state.step(kilo, 1), { more: true, first: false });
  state.step(kilo, -1);
  assert.deepEqual(state.step(kilo, -1), { more: false, first: false });
  assert.deepEqual(state.step(kilo, -1), { more: false, first: false });
  assert.equal(saved.length, 4);
});

test("a step says whether the same step can follow", () => {
  const { state } = setup(setQuantity(emptyCart, kilo, maxQuantity - 1));
  assert.equal(state.step(kilo, 1).more, false);
  assert.equal(state.canStep(kilo.id, 1), false);
  assert.equal(state.canStep(kilo.id, -1), true);
  assert.equal(state.step(half, -1).more, false);
});

test("before the days arrive, the next free day of the store page is the day", () => {
  const { state } = setup();
  assert.deepEqual(state.resolved, { day: today, missed: null });
  state.pickDay(saturday);
  assert.deepEqual(state.resolved, { day: saturday, missed: null });
});

test("a picked day that no longer fits is missed until the buyer picks again", () => {
  const { state, changes } = setup();
  state.pickDay(saturday);
  state.setDays(days({ saturdayFits: false }));
  assert.deepEqual(changes.at(-1), { cart: false, days: true });
  assert.deepEqual(state.resolved, {
    day: null,
    missed: { day: saturday, reason: "not_enough_space" },
  });
  state.pickDay(today);
  assert.deepEqual(state.resolved, { day: today, missed: null });
});

test("a reading fills the cart, marks its packs, and can be undone", () => {
  const { state, saved } = setup(setQuantity(emptyCart, half, 1));
  const applied = state.applyReading(reading());
  assert.equal(quantityOf(state.cart, kilo.id), 1);
  assert.equal(state.marks.get(kilo.id), "near");
  assert.equal(state.cart.day, saturday);
  assert.equal(state.cart.picked_by, "voice");
  assert.equal(applied.added.length, 1);
  assert.equal(state.canUndoReading, true);
  state.undoReading();
  assert.equal(quantityOf(state.cart, kilo.id), 0);
  assert.equal(quantityOf(state.cart, half.id), 1);
  assert.equal(state.marks.size, 0);
  assert.equal(state.canUndoReading, false);
  assert.equal(saved.length, 2);
});

test("a step by hand clears the mark of its pack, and the undo", () => {
  const { state } = setup();
  state.applyReading(reading());
  state.step(kilo, 1);
  assert.equal(state.marks.has(kilo.id), false);
  assert.equal(state.canUndoReading, false);
});

test("picking the day that the voice note picked confirms it", () => {
  const { state } = setup();
  state.applyReading(reading());
  state.pickDay(saturday);
  assert.equal(state.cart.picked_by, "buyer");
});

function setup(cart: Cart = emptyCart) {
  const saved: Cart[] = [];
  const changes: StoreChange[] = [];
  const state = createStoreState({
    slug: "shobhas-kitchen",
    storage: { save: (_slug, next) => saved.push(next) },
    cart,
    nextFreeDay: today,
    onChange: (change) => changes.push(change),
  });
  return { state, saved, changes };
}

function days({ saturdayFits }: { saturdayFits: boolean }): DaysResponse {
  return {
    today,
    limit_unit: "kg",
    cart_load: 1000,
    days: [
      { day: today, fits: true, reason: null, space_left: 25000 },
      saturdayFits
        ? { day: saturday, fits: true, reason: null, space_left: 2000 }
        : {
            day: saturday,
            fits: false,
            reason: "not_enough_space",
            space_left: 500,
          },
    ],
    next_free_day: today,
  };
}

function reading(): CartReading {
  const item: DraftItem = {
    item_id: "00000000-0000-4000-8000-0000000000a1",
    name: "ಮೈಸೂರು ಪಾಕ್",
    said: "one kilo Mysore pak",
    asked: { quantity: 1.2, unit: "kg", pack_grams: null, pack_pieces: null },
    packs: [
      {
        pack_id: kilo.id,
        label: "1 kg",
        quantity: 1,
        price: 88000,
        grams: 1000,
        pieces: null,
      },
    ],
    near_amount: true,
    near_name: false,
    sold_out: false,
  };
  return { items: [item], unmatched: [], day: saturday, total: 88000 };
}
