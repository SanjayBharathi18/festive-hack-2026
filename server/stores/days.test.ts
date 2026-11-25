import assert from "node:assert/strict";
import { test } from "node:test";
import type { MenuItem, Pack } from "../../shared/store.ts";
import type { DayRules } from "../capacity/capacity.ts";
import { cartAmounts, daysForCart } from "./days.ts";

const kilo: Pack = {
  id: "9e8d7c6b-5a49-4382-a716-000000000001",
  label: "1 kg",
  grams: 1000,
  pieces: null,
  price: 88000,
};
const dozen: Pack = {
  id: "9e8d7c6b-5a49-4382-a716-000000000002",
  label: "12 pieces",
  grams: 480,
  pieces: 12,
  price: 30000,
};
const missingPack = "9e8d7c6b-5a49-4382-a716-000000000003";

function menuItem(id: string, packs: Pack[]): MenuItem {
  return {
    id,
    name: id,
    name_latin: null,
    name_script: null,
    category: "sweets",
    veg_mark: "veg",
    allergens: [],
    box_contents: null,
    photo: null,
    special: false,
    sold_out: false,
    packs,
  };
}

const menu = [menuItem("mysore-pak", [kilo]), menuItem("karanji", [dozen])];

function rules(overrides: Partial<DayRules> = {}): DayRules {
  return {
    taking_orders: true,
    limit_unit: "kg",
    daily_limit: 25_000,
    working_days: 127,
    last_order_day: null,
    closed_dates: new Set(),
    ...overrides,
  };
}

test("cartAmounts gives each cart line the amounts of its pack", () => {
  assert.deepEqual(
    cartAmounts(menu, [
      { pack_id: kilo.id, quantity: 2 },
      { pack_id: dozen.id, quantity: 1 },
      { pack_id: kilo.id, quantity: 1 },
    ]),
    {
      lines: [
        { quantity: 2, grams: 1000, pieces: null },
        { quantity: 1, grams: 480, pieces: 12 },
        { quantity: 1, grams: 1000, pieces: null },
      ],
      missing: [],
    },
  );
  assert.deepEqual(cartAmounts(menu, []), { lines: [], missing: [] });
});

test("cartAmounts lists the packs that are not on the menu, and keeps the rest", () => {
  assert.deepEqual(
    cartAmounts(menu, [
      { pack_id: missingPack, quantity: 1 },
      { pack_id: kilo.id, quantity: 3 },
      { pack_id: missingPack, quantity: 2 },
    ]),
    {
      lines: [{ quantity: 3, grams: 1000, pieces: null }],
      missing: [missingPack, missingPack],
    },
  );
  assert.deepEqual(cartAmounts([], [{ pack_id: kilo.id, quantity: 1 }]), {
    lines: [],
    missing: [kilo.id],
  });
});

test("daysForCart checks each day and names the first day that fits", () => {
  const loads = new Map([
    ["2026-11-24", 24_000],
    ["2026-11-25", 25_000],
  ]);
  const answer = daysForCart(
    { rules: rules({ closed_dates: new Set(["2026-11-26"]) }), loads },
    [{ quantity: 2, grams: 1000, pieces: null }],
    "2026-11-24",
    "2026-11-27",
  );
  assert.deepEqual(answer, {
    today: "2026-11-24",
    limit_unit: "kg",
    cart_load: 2000,
    days: [
      {
        day: "2026-11-24",
        fits: false,
        reason: "not_enough_space",
        space_left: 1000,
      },
      { day: "2026-11-25", fits: false, reason: "full", space_left: 0 },
      { day: "2026-11-26", fits: false, reason: "closed", space_left: null },
      { day: "2026-11-27", fits: true, reason: null, space_left: 25_000 },
    ],
    next_free_day: "2026-11-27",
  });
});

test("daysForCart has no next free day when no day fits, and counts the cart in her unit", () => {
  const paused = daysForCart(
    { rules: rules({ taking_orders: false }), loads: new Map() },
    [],
    "2026-11-24",
    "2026-11-25",
  );
  assert.equal(paused.next_free_day, null);
  const byOrders = daysForCart(
    {
      rules: rules({ limit_unit: "orders", daily_limit: 15 }),
      loads: new Map(),
    },
    [{ quantity: 5, grams: 1000, pieces: null }],
    "2026-11-24",
    "2026-11-24",
  );
  assert.deepEqual(
    [byOrders.limit_unit, byOrders.cart_load, byOrders.next_free_day],
    ["orders", 1, "2026-11-24"],
  );
});
