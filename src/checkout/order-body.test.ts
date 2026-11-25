import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutBodySchema } from "../../shared/orders.ts";
import { emptyCart, setQuantity } from "../cart/cart.ts";
import { emptyDraft } from "./checkout-storage.ts";
import { isCode, isPhone, orderBody } from "./order-body.ts";

const cart = setQuantity(
  emptyCart,
  { id: "00000000-0000-4000-8000-000000000001", price: 88000 },
  2,
);
const base = {
  storeId: "00000000-0000-4000-8000-0000000000aa",
  via: undefined,
  day: "2026-11-28",
  cart,
  name: "  Arjun ",
  language: "kn" as const,
};

test("a pickup order sends no address and no gift, even if they were typed", () => {
  const body = orderBody({
    ...base,
    draft: {
      ...emptyDraft,
      fulfilment: "pickup",
      address: "Jayanagar",
      gift: true,
      gift_name: "Amma",
    },
  });
  assert.equal(body.address, null);
  assert.equal(body.gift, null);
  assert.equal(body.buyer_name, "Arjun");
  assert.equal(body.buyer_language, "kn");
  assert.deepEqual(body.cart, [
    { pack_id: cart.lines[0]?.pack_id, quantity: 2, price: 88000 },
  ]);
  assert.equal("via" in body, false);
  assert.ok(
    checkoutBodySchema.safeParse({ ...body, proof: "p".repeat(40) }).success,
  );
});

test("a delivery gift sends the address, the name, and nothing for empty fields", () => {
  const body = orderBody({
    ...base,
    via: "market",
    draft: {
      ...emptyDraft,
      fulfilment: "delivery",
      address: " Jayanagar 4th Block ",
      gift: true,
      gift_name: "Amma",
      gift_phone: " ",
      gift_message: "Happy Diwali!",
      note: " less sugar ",
    },
  });
  assert.equal(body.via, "market");
  assert.equal(body.address, "Jayanagar 4th Block");
  assert.deepEqual(body.gift, {
    name: "Amma",
    phone: null,
    message: "Happy Diwali!",
  });
  assert.equal(body.note, "less sugar");
  assert.ok(
    checkoutBodySchema.safeParse({ ...body, proof: "p".repeat(40) }).success,
  );
});

test("a delivery that is not a gift sends no gift", () => {
  const body = orderBody({
    ...base,
    draft: {
      ...emptyDraft,
      fulfilment: "delivery",
      address: "Jayanagar",
      gift_name: "Amma",
    },
  });
  assert.equal(body.gift, null);
});

test("numbers and codes are checked with the server's own rules", () => {
  assert.equal(isPhone("98765 43210"), true);
  assert.equal(isPhone("+44 7700 900123"), true);
  assert.equal(isPhone("98450"), false);
  assert.equal(isCode("123 456"), true);
  assert.equal(isCode("12345"), false);
});
