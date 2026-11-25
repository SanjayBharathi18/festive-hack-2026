import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyCart, type Cart } from "./cart.ts";
import {
  createCartStorage,
  storageOf,
  type KeyValueStore,
} from "./cart-storage.ts";

const packId = "00000000-0000-4000-8000-000000000001";
const cart: Cart = {
  lines: [{ pack_id: packId, quantity: 2, price: 88000 }],
  day: "2026-11-28",
  picked_by: "buyer",
};

test("each store keeps its own cart on the phone", () => {
  const store = memoryStore();
  const storage = createCartStorage(store);
  storage.save("shobhas-kitchen", cart);
  assert.deepEqual(storage.load("shobhas-kitchen"), cart);
  assert.deepEqual(storage.load("ghar-ki-mithai"), emptyCart);
  storage.clear("shobhas-kitchen");
  assert.deepEqual(storage.load("shobhas-kitchen"), emptyCart);
});

test("an empty cart with no day leaves nothing behind", () => {
  const store = memoryStore();
  const storage = createCartStorage(store);
  storage.save("shobhas-kitchen", cart);
  storage.save("shobhas-kitchen", emptyCart);
  assert.equal(store.items.size, 0);
});

test("a saved cart that is broken or of an old shape gives an empty cart", () => {
  const store = memoryStore();
  const storage = createCartStorage(store);
  for (const text of [
    "not json",
    JSON.stringify({ v: 2, lines: [] }),
    JSON.stringify({
      v: 1,
      lines: [{ pack_id: "x", quantity: 1, price: 1 }],
      day: null,
      picked_by: null,
    }),
    JSON.stringify({
      v: 1,
      lines: [{ pack_id: packId, quantity: 0, price: 1 }],
      day: null,
      picked_by: null,
    }),
    JSON.stringify({
      v: 1,
      lines: [
        { pack_id: packId, quantity: 1, price: 1 },
        { pack_id: packId, quantity: 2, price: 1 },
      ],
      day: null,
      picked_by: null,
    }),
  ]) {
    store.items.set("cart:shobhas-kitchen", text);
    assert.deepEqual(storage.load("shobhas-kitchen"), emptyCart, text);
  }
});

test("a blocked or full storage never stops the page", () => {
  const reports: string[] = [];
  const broken: KeyValueStore = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  const storage = createCartStorage(broken, (message) => reports.push(message));
  assert.deepEqual(storage.load("shobhas-kitchen"), emptyCart);
  storage.save("shobhas-kitchen", cart);
  storage.clear("shobhas-kitchen");
  assert.equal(reports.length, 3);
  assert.deepEqual(
    createCartStorage(undefined).load("shobhas-kitchen"),
    emptyCart,
  );
  assert.equal(
    storageOf(() => {
      throw new Error("SecurityError");
    }),
    undefined,
  );
});

function memoryStore() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}
