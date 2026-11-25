import assert from "node:assert/strict";
import { test } from "node:test";
import type { BulkItem } from "../../shared/bulk.ts";
import {
  bulkEstimate,
  createBulkCart,
  searchBulk,
  shortLines,
  underMinimum,
  type BulkCartState,
} from "./bulk-cart.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const kaju: BulkItem = {
  id: id(1),
  name: "Kaju katli",
  name_latin: "Kaju katli",
  name_script: null,
  veg_mark: "veg",
  min_qty: 500,
  unit: "pieces",
  price: 1500,
};
const box: BulkItem = {
  ...kaju,
  id: id(2),
  name: "Assorted gift box",
  name_latin: null,
  min_qty: 100,
  price: null,
};
const ghar = { id: id(10), name: "Ghar Ki Mithai" };
const other = { id: id(11), name: "Faral Ghar" };

test("each store keeps its own cart, and all of them show", () => {
  const states: BulkCartState[] = [];
  const cart = createBulkCart((state) => states.push(state));
  const storesOf = () => cart.state.carts.map(({ store }) => store.name);
  cart.set(ghar, kaju, 600);
  assert.deepEqual(storesOf(), ["Ghar Ki Mithai"]);
  assert.equal(cart.state.carts[0]?.estimate, 9_000_00);
  cart.set(other, { ...kaju, id: id(3) }, 30);
  assert.deepEqual(storesOf(), ["Ghar Ki Mithai", "Faral Ghar"]);
  assert.deepEqual(
    cart.state.carts[0]?.lines.map(({ quantity }) => quantity),
    [600],
    "the first cart keeps its line",
  );
  assert.equal(cart.quantity(ghar.id, kaju.id), 600);
  cart.set(other, { ...kaju, id: id(3) }, 0);
  assert.deepEqual(storesOf(), ["Ghar Ki Mithai"], "an empty cart goes");
  cart.clear(ghar.id);
  assert.deepEqual(cart.state.carts, []);
  assert.equal(states.length, 4);
});

test("a quantity under the minimum stays, marked short", () => {
  const cart = createBulkCart(() => {});
  cart.set(ghar, kaju, 200);
  cart.set(ghar, box, 150);
  assert.deepEqual(
    cart.state.carts[0]?.short.map(({ item }) => item.name),
    ["Kaju katli"],
  );
  assert.deepEqual(shortLines([{ item: box, quantity: 100 }]), []);
  assert.equal(underMinimum(200, kaju), true, "plays limit");
  assert.equal(underMinimum(500, kaju), false);
  assert.equal(underMinimum(0, kaju), false, "an empty field is silent");
  assert.equal(underMinimum(Number.NaN, kaju), false);
});

test("the estimate is null when a price is on request", () => {
  assert.equal(bulkEstimate([]), 0);
  assert.equal(bulkEstimate([{ item: kaju, quantity: 500 }]), 750_000);
  assert.equal(
    bulkEstimate([
      { item: kaju, quantity: 500 },
      { item: box, quantity: 100 },
    ]),
    null,
  );
});

test("the search finds items by name, or whole stores by name and area", () => {
  const stores = [
    {
      store: { name: "Ghar Ki Mithai", area: "HSR Layout" },
      items: [kaju, box],
    },
    {
      store: { name: "Faral Ghar", area: "Whitefield" },
      items: [{ ...kaju, id: id(3), name: "Chakli", name_latin: "Chakli" }],
    },
  ];
  assert.equal(searchBulk(stores, "").length, 2);
  assert.deepEqual(
    searchBulk(stores, "  KAJU ").map(({ store, items }) => [
      store.name,
      items.length,
    ]),
    [["Ghar Ki Mithai", 1]],
  );
  assert.deepEqual(
    searchBulk(stores, "whitefield").map(({ store }) => store.name),
    ["Faral Ghar"],
  );
  assert.deepEqual(
    searchBulk(stores, "gift box").map(({ items }) => items[0]?.name),
    ["Assorted gift box"],
  );
  assert.deepEqual(searchBulk(stores, "rasgulla"), []);
});
