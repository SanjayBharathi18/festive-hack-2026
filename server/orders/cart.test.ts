import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrderLine } from "../../shared/orders.ts";
import type { MenuItem } from "../../shared/store.ts";
import { keptOffers, menuOffers, orderTotal, priceCart } from "./cart.ts";

const pack = (id: string, label: string, grams: number, price: number) => ({
  id,
  label,
  grams,
  pieces: null,
  price,
});

const item = (
  id: string,
  name: string,
  packs: MenuItem["packs"],
  soldOut = false,
): MenuItem => ({
  id,
  name,
  name_latin: name,
  name_script: null,
  category: "sweets",
  veg_mark: "veg",
  allergens: [],
  box_contents: null,
  photo: null,
  special: false,
  sold_out: soldOut,
  packs,
});

const menu = [
  item("mysore-pak", "Mysore pak", [
    pack("mp-500", "500 g", 500, 45000),
    pack("mp-1000", "1 kg", 1000, 88000),
  ]),
  item("kaju-katli", "Kaju katli", [pack("kk-500", "500 g", 500, 65000)], true),
];

const checkout = { checkPrices: true, allowSoldOut: false };
const desk = { checkPrices: false, allowSoldOut: true };

test("a cart gets the current pack, price, grams and pieces of each line", () => {
  const priced = priceCart(
    menuOffers(menu),
    [
      { pack_id: "mp-1000", quantity: 2, price: 88000 },
      { pack_id: "mp-500", quantity: 1, price: 45000 },
    ],
    checkout,
  );
  assert.deepEqual(priced, {
    ok: true,
    total: 221000,
    lines: [
      {
        item_id: "mysore-pak",
        pack_id: "mp-1000",
        name: "Mysore pak",
        label: "1 kg",
        quantity: 2,
        price: 88000,
        grams: 1000,
        pieces: null,
      },
      {
        item_id: "mysore-pak",
        pack_id: "mp-500",
        name: "Mysore pak",
        label: "500 g",
        quantity: 1,
        price: 45000,
        grams: 500,
        pieces: null,
      },
    ],
  });
});

test("a pack that is not on her menu is refused", () => {
  assert.deepEqual(
    priceCart(
      menuOffers(menu),
      [{ pack_id: "other", quantity: 1, price: 1 }],
      checkout,
    ),
    { ok: false, problem: { kind: "unavailable" } },
  );
});

test("checkout refuses a sold-out item, the desk takes it", () => {
  const cart = [{ pack_id: "kk-500", quantity: 1, price: 65000 }];
  assert.deepEqual(priceCart(menuOffers(menu), cart, checkout), {
    ok: false,
    problem: { kind: "sold_out", name: "Kaju katli" },
  });
  assert.equal(priceCart(menuOffers(menu), cart, desk).ok, true);
});

test("checkout refuses a price that the buyer did not see", () => {
  assert.deepEqual(
    priceCart(
      menuOffers(menu),
      [{ pack_id: "mp-500", quantity: 1, price: 40000 }],
      checkout,
    ),
    { ok: false, problem: { kind: "price_changed", name: "Mysore pak" } },
  );
  const deskCart = priceCart(
    menuOffers(menu),
    [{ pack_id: "mp-500", quantity: 1 }],
    desk,
  );
  assert.ok(deskCart.ok);
  assert.equal(deskCart.total, 45000);
});

test("an edit keeps the price of each pack already in the order", () => {
  const old: OrderLine[] = [
    {
      item_id: "mysore-pak",
      pack_id: "mp-500",
      name: "Mysore pak",
      label: "500 g",
      quantity: 1,
      price: 40000,
      grams: 500,
      pieces: null,
    },
  ];
  const priced = priceCart(
    keptOffers(menu, old),
    [
      { pack_id: "mp-500", quantity: 2 },
      { pack_id: "mp-1000", quantity: 1 },
    ],
    desk,
  );
  assert.ok(priced.ok);
  assert.deepEqual(
    priced.lines.map((line) => line.price),
    [40000, 88000],
  );
  assert.equal(priced.total, 168000);
});

test("the total is the sum of price times quantity", () => {
  assert.equal(orderTotal([]), 0);
  assert.equal(
    orderTotal([
      { price: 23000, quantity: 3 },
      { price: 11000, quantity: 1 },
    ]),
    80000,
  );
});
