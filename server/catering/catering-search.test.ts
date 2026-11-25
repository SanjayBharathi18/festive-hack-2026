import assert from "node:assert/strict";
import { test } from "node:test";
import { byLowestPrice, matchingPackages, offerOf } from "./catering-search.ts";
import { daawatPackages } from "./test-packages.ts";

const names = (list: readonly { name: string }[]) =>
  list.map(({ name }) => name);

test("with no filters, each package matches", () => {
  const { silver, gold, buffet } = daawatPackages();
  assert.deepEqual(names(matchingPackages([silver, gold, buffet], {})), [
    "Silver plate",
    "Gold plate",
    "Buffet",
  ]);
});

test("guests: only packages whose minimum fits", () => {
  const { silver, gold, buffet } = daawatPackages();
  const all = [silver, gold, buffet];
  assert.deepEqual(names(matchingPackages(all, { guests: 120 })), [
    "Silver plate",
    "Gold plate",
  ]);
  assert.deepEqual(names(matchingPackages(all, { guests: 99 })), []);
  assert.equal(matchingPackages(all, { guests: 150 }).length, 3);
});

test("price: up to the most, and a price on request fits", () => {
  const { silver, gold, buffet } = daawatPackages();
  assert.deepEqual(
    names(matchingPackages([silver, gold, buffet], { max_price: 40_000 })),
    ["Silver plate", "Buffet"],
  );
});

test("food type: Jain finds only the free buffet of Daawat", () => {
  const { silver, gold, buffet } = daawatPackages();
  const all = [silver, gold, buffet];
  assert.deepEqual(names(matchingPackages(all, { food: "jain" })), ["Buffet"]);
  assert.deepEqual(names(matchingPackages(all, { food: "non_veg" })), []);
  assert.equal(matchingPackages(all, { food: "mixed" }).length, 3);
  assert.deepEqual(
    names(matchingPackages(all, { food: "jain", guests: 120 })),
    [],
  );
});

test("an offer keeps the package without its dishes, with the limit of each category", () => {
  const { silver } = daawatPackages();
  const offer = offerOf(silver);
  assert.equal("categories" in offer, false);
  assert.equal(offer.price, 35_000);
  assert.deepEqual(offer.limits.slice(0, 2), [
    { name: "Sweets", min: 1, max: 2 },
    { name: "Starters", min: 0, max: 2 },
  ]);
});

test("caterers sort by their cheapest priced package, prices on request last", () => {
  const caterers = [
    { name: "Zaika", packages: [{ price: null }] },
    { name: "Daawat", packages: [{ price: 50_000 }, { price: 35_000 }] },
    { name: "Annapoorna", packages: [{ price: 35_000 }] },
    { name: "Bhoj", packages: [{ price: null }] },
  ];
  assert.deepEqual(
    caterers.sort(byLowestPrice).map(({ name }) => name),
    ["Annapoorna", "Daawat", "Bhoj", "Zaika"],
  );
});
