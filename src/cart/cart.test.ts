import assert from "node:assert/strict";
import { test } from "node:test";
import type { MenuItem, MenuSection } from "../../shared/store.ts";
import {
  addLines,
  cartCount,
  cartTotal,
  checkoutLines,
  dayCheckLines,
  emptyCart,
  maxLines,
  maxQuantity,
  menuPacks,
  quantityOf,
  reconcile,
  setQuantity,
  withDay,
  type Cart,
} from "./cart.ts";

const kilo = { id: "00000000-0000-4000-8000-000000000001", price: 88000 };
const half = { id: "00000000-0000-4000-8000-000000000002", price: 45000 };

test("setQuantity adds a pack, changes it, and takes it out at 0", () => {
  const one = setQuantity(emptyCart, kilo, 1);
  assert.deepEqual(one.lines, [
    { pack_id: kilo.id, quantity: 1, price: 88000 },
  ]);
  const three = setQuantity(one, kilo, 3);
  assert.equal(quantityOf(three, kilo.id), 3);
  assert.deepEqual(setQuantity(three, kilo, 0).lines, []);
  assert.equal(setQuantity(emptyCart, kilo, 0), emptyCart);
});

test("a quantity stays between 0 and 999, in whole packs", () => {
  assert.equal(
    quantityOf(setQuantity(emptyCart, kilo, 5000), kilo.id),
    maxQuantity,
  );
  assert.equal(quantityOf(setQuantity(emptyCart, kilo, 2.7), kilo.id), 2);
  assert.deepEqual(setQuantity(emptyCart, kilo, -1).lines, []);
  assert.deepEqual(setQuantity(emptyCart, kilo, Number.NaN).lines, []);
});

test("a full cart takes no new pack, but its packs still change", () => {
  let cart: Cart = emptyCart;
  for (let index = 0; index < maxLines; index++) {
    cart = setQuantity(cart, { id: `pack-${index}`, price: 100 }, 1);
  }
  assert.equal(setQuantity(cart, kilo, 1), cart);
  assert.equal(
    quantityOf(setQuantity(cart, { id: "pack-0", price: 100 }, 4), "pack-0"),
    4,
  );
});

test("addLines sums with the packs already in the cart", () => {
  const cart = addLines(setQuantity(emptyCart, kilo, 1), [
    { pack_id: kilo.id, quantity: 2, price: 88000 },
    { pack_id: half.id, quantity: 1, price: 45000 },
  ]);
  assert.equal(quantityOf(cart, kilo.id), 3);
  assert.equal(quantityOf(cart, half.id), 1);
});

test("count, total and the lines for the API", () => {
  const cart = setQuantity(setQuantity(emptyCart, kilo, 2), half, 1);
  assert.equal(cartCount(cart), 3);
  assert.equal(cartTotal(cart), 2 * 88000 + 45000);
  assert.deepEqual(dayCheckLines(cart), [
    { pack_id: kilo.id, quantity: 2 },
    { pack_id: half.id, quantity: 1 },
  ]);
  assert.deepEqual(checkoutLines(cart), [
    { pack_id: kilo.id, quantity: 2, price: 88000 },
    { pack_id: half.id, quantity: 1, price: 45000 },
  ]);
});

test("withDay keeps who picked the day, and no one picks no day", () => {
  assert.deepEqual(withDay(emptyCart, "2026-11-28", "voice"), {
    lines: [],
    day: "2026-11-28",
    picked_by: "voice",
  });
  assert.equal(withDay(emptyCart, null, "buyer").picked_by, null);
});

test("reconcile drops gone and sold-out packs and takes the new price", () => {
  const sections = menu([
    item("Mysore pak", [{ ...kilo, price: 90000 }]),
    item("Kaju katli", [half], { sold_out: true }),
  ]);
  const cart: Cart = {
    lines: [
      { pack_id: kilo.id, quantity: 2, price: 88000 },
      { pack_id: half.id, quantity: 1, price: 45000 },
      {
        pack_id: "00000000-0000-4000-8000-00000000000f",
        quantity: 1,
        price: 100,
      },
    ],
    day: "2026-11-28",
    picked_by: "buyer",
  };
  const { cart: next, changes } = reconcile(cart, menuPacks(sections));
  assert.deepEqual(next.lines, [
    { pack_id: kilo.id, quantity: 2, price: 90000 },
  ]);
  assert.equal(next.day, "2026-11-28");
  assert.deepEqual(
    changes.map((change) => change.kind),
    ["price", "sold_out", "gone"],
  );
  const price = changes[0];
  assert.equal(price?.kind === "price" ? price.before : undefined, 88000);
});

test("reconcile gives the same cart back when nothing changed", () => {
  const cart = setQuantity(emptyCart, kilo, 1);
  const result = reconcile(cart, menuPacks(menu([item("Mysore pak", [kilo])])));
  assert.equal(result.cart, cart);
  assert.deepEqual(result.changes, []);
});

function menu(items: MenuItem[]): MenuSection[] {
  return [{ category: "sweets", items }];
}

function item(
  name: string,
  packs: { id: string; price: number }[],
  extra: Partial<MenuItem> = {},
): MenuItem {
  return {
    id: crypto.randomUUID(),
    name,
    name_latin: name,
    name_script: null,
    category: "sweets",
    veg_mark: "veg",
    allergens: [],
    box_contents: null,
    photo: null,
    special: false,
    sold_out: false,
    packs: packs.map((pack) => ({
      ...pack,
      label: "1 kg",
      grams: 1000,
      pieces: null,
    })),
    ...extra,
  };
}
