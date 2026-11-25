import assert from "node:assert/strict";
import { test } from "node:test";
import { publicStoreSchema, type MenuItem } from "../../shared/store.ts";
import type { DayRules } from "../capacity/capacity.ts";
import { flagDefaults } from "../flags/decisions.ts";
import type { Store } from "./store-data.ts";
import {
  publicStore,
  storePage,
  storeRating,
  workingWeekdays,
} from "./store-page.ts";

const store: Store = {
  id: "c36aaa8f-ac70-86b9-a181-80bade5b717d",
  seller_id: "seller-1",
  slug: "shobhas-kitchen",
  name: "Shobha's Kitchen",
  cover_photo: null,
  area: "Basavanagudi",
  city: "Bengaluru",
  address: "No. 1, Demo Lane, Basavanagudi",
  lat: 12.9417,
  lng: 77.5755,
  offers_pickup: true,
  offers_delivery: false,
  accepts_online: true,
  advance_for_strangers: false,
  in_marketplace: true,
  fssai: "00000000000000",
  normal_orders_on: true,
  bulk_on: true,
  bulk_line: "Bulk and corporate orders taken",
  catering_on: false,
  paused: false,
  limit_unit: "kg",
  daily_limit: 25_000,
  last_order_day: "2026-12-10",
  working_days: 127,
  slug_changed: false,
  is_demo: true,
};

function menuItem(id: string, overrides: Partial<MenuItem> = {}): MenuItem {
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
    packs: [],
    ...overrides,
  };
}

function rules(overrides: Partial<DayRules> = {}): DayRules {
  return {
    taking_orders: true,
    limit_unit: "kg",
    daily_limit: 25_000,
    working_days: 127,
    last_order_day: "2026-12-10",
    closed_dates: new Set(),
    ...overrides,
  };
}

test("publicStore gives only the allow-listed fields", () => {
  const shown = publicStore(store);
  assert.deepEqual(
    Object.keys(shown).sort(),
    Object.keys(publicStoreSchema.shape).sort(),
  );
  assert.deepEqual(publicStoreSchema.parse(shown), shown);
  const json = JSON.stringify(shown);
  for (const key of [
    "address",
    "phone",
    "seller_id",
    "lat",
    "lng",
    "bulk_line",
    "daily_limit",
  ]) {
    assert.equal(key in shown, false, key);
  }
  for (const value of ["Demo Lane", "seller-1", "12.9417", "77.5755"]) {
    assert.equal(json.includes(value), false, value);
  }
});

test("storeRating gives the stars to one decimal, and none with no average or no count", () => {
  assert.deepEqual(storeRating(4.8, 312), { average: 4.8, count: 312 });
  assert.deepEqual(storeRating(4.25, 7), { average: 4.3, count: 7 });
  assert.equal(storeRating(null, 0), null);
  assert.equal(storeRating(4.5, 0), null);
});

test("workingWeekdays lists her weekdays from Sunday (0) to Saturday (6)", () => {
  assert.deepEqual(workingWeekdays(127), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(workingWeekdays(0b0111110), [1, 2, 3, 4, 5]);
  assert.deepEqual(workingWeekdays(0b1000001), [0, 6]);
  assert.deepEqual(workingWeekdays(1), [0]);
});

test("storePage puts the store, its sections, its days, the page flags and the Sarvam mode together", () => {
  const page = storePage({
    store: { ...store, working_days: 0b1111110 },
    menu: [
      menuItem("chakkuli", { category: "savouries" }),
      menuItem("diwali-box", { special: true }),
      menuItem("mysore-pak"),
    ],
    capacity: {
      rules: rules({
        working_days: 0b1111110,
        closed_dates: new Set(["2026-11-26", "2026-11-24"]),
      }),
      loads: new Map([["2026-11-25", 25_000]]),
    },
    today: "2026-11-24",
    until: "2026-12-14",
    flags: { ...flagDefaults, ops_voice: false, cfg_demo_trace: true },
    recorded: true,
  });
  assert.deepEqual(page.store, publicStore(store));
  assert.deepEqual(
    page.sections.map(({ category, items }) => [
      category,
      items.map(({ id }) => id),
    ]),
    [
      ["sweets", ["diwali-box", "mysore-pak"]],
      ["savouries", ["chakkuli"]],
    ],
  );
  assert.deepEqual(page.days, {
    today: "2026-11-24",
    working_days: [1, 2, 3, 4, 5, 6],
    closed_dates: ["2026-11-24", "2026-11-26"],
    last_order_day: "2026-12-10",
    next_free_day: "2026-11-27",
  });
  assert.deepEqual(page.flags, { ops_voice: false });
  assert.equal(page.recorded, true);
});

test("storePage has no next free day when no day in the range has space", () => {
  const page = storePage({
    store,
    menu: [],
    capacity: { rules: rules({ taking_orders: false }), loads: new Map() },
    today: "2026-11-24",
    until: "2026-12-14",
    flags: flagDefaults,
    recorded: false,
  });
  assert.equal(page.days.next_free_day, null);
  assert.equal(page.recorded, false);
  assert.deepEqual(page.sections, []);
});
