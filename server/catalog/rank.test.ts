import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceKm, type Point } from "../../shared/geo.ts";
import {
  byNeedBy,
  pinCell,
  rankStores,
  roundedKm,
  type Ranked,
} from "./rank.ts";

const store = (name: string, fields: Partial<Ranked> = {}): Ranked => ({
  name,
  taking_orders: true,
  distance: null,
  rating: null,
  next_free_day: "2026-11-25",
  ...fields,
});

const names = (stores: readonly Ranked[]) => stores.map(({ name }) => name);

test("best rated first: rated cooks by their average, then the new ones, each by their next day with space", () => {
  const stores = [
    store("New, later", { next_free_day: "2026-11-28" }),
    store("Rated 4.2", { rating: 4.2 }),
    store("New, sooner", { next_free_day: "2026-11-24" }),
    store("Rated 4.8, later", { rating: 4.8, next_free_day: "2026-11-27" }),
    store("New, full", { next_free_day: null }),
    store("Rated 4.8, sooner", { rating: 4.8, next_free_day: "2026-11-26" }),
  ];
  assert.deepEqual(names(rankStores(stores, "rating")), [
    "Rated 4.8, sooner",
    "Rated 4.8, later",
    "Rated 4.2",
    "New, sooner",
    "New, later",
    "New, full",
  ]);
});

test("nearest first, with cooks of no known place after the others", () => {
  const stores = [
    store("Far", { distance: 9.4 }),
    store("Unknown"),
    store("Near", { distance: 1.2 }),
  ];
  assert.deepEqual(names(rankStores(stores, "distance")), [
    "Near",
    "Far",
    "Unknown",
  ]);
});

test("a cook who takes no orders now comes last in both sorts", () => {
  const stores = [
    store("Paused", {
      taking_orders: false,
      distance: 0.5,
      rating: 5,
    }),
    store("Open", { distance: 7 }),
  ];
  assert.deepEqual(names(rankStores(stores, "distance")), ["Open", "Paused"]);
  assert.deepEqual(names(rankStores(stores, "rating")), ["Open", "Paused"]);
});

test("Need it by keeps the cooks with space by that day", () => {
  const stores = [
    store("Wed", { next_free_day: "2026-11-25" }),
    store("Sat", { next_free_day: "2026-11-28" }),
    store("Full", { next_free_day: null }),
  ];
  assert.deepEqual(byNeedBy(stores, null), { stores, met: true });
  const byFriday = byNeedBy(stores, "2026-11-27");
  assert.equal(byFriday.met, true);
  assert.deepEqual(names(byFriday.stores), ["Wed"]);
  assert.deepEqual(names(byNeedBy(stores, "2026-11-25").stores), ["Wed"]);
});

test("with no cook in time, Need it by shows the nearest later days", () => {
  const stores = [
    store("Sat", { next_free_day: "2026-11-28" }),
    store("Full", { next_free_day: null }),
    store("Thu", { next_free_day: "2026-11-26" }),
  ];
  const early = byNeedBy(stores, "2026-11-24");
  assert.equal(early.met, false);
  assert.deepEqual(names(early.stores), ["Thu", "Sat"]);
});

test("a distance is in whole kilometres, at least 1", () => {
  const km = distanceKm(
    { lat: 12.9417, lng: 77.5755 },
    { lat: 12.9116, lng: 77.6474 },
  );
  assert.equal(roundedKm(km), 8);
  assert.equal(roundedKm(0.2), 1);
  assert.equal(roundedKm(2.5), 3);
});

test("a distance starts at the middle of the pin's grid cell, so searches from chosen places cannot find her home", () => {
  const home = { lat: 12.9116, lng: 77.6474 };
  const sameCell = { lat: 12.9184, lng: 77.6401 };
  const cell = pinCell(home);
  assert.ok(Math.abs(cell.lat - 12.915) < 1e-9, String(cell.lat));
  assert.ok(Math.abs(cell.lng - 77.645) < 1e-9, String(cell.lng));
  assert.deepEqual(pinCell(sameCell), cell);
  // The search for the place where the rounded distance changes, from 2 km
  // to 3 km, finds the same place for both pins: it shows the cell only.
  const north = { lat: 12.9184, lng: 77.6474 };
  const flip = (pin: Point, measuredFrom: Point) => {
    let lat = pin.lat;
    while (roundedKm(distanceKm({ lat, lng: pin.lng }, measuredFrom)) < 3) {
      lat += 0.0001;
    }
    return Math.round(lat * 10_000);
  };
  assert.equal(flip(home, pinCell(home)), flip(north, pinCell(north)));
  assert.notEqual(flip(home, home), flip(north, north));
});
