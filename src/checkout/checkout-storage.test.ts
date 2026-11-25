import assert from "node:assert/strict";
import { test } from "node:test";
import { createCheckoutStorage, emptyDraft } from "./checkout-storage.ts";

test("the name and number stay on the phone for the next order", () => {
  const phone = memoryStore();
  const storage = createCheckoutStorage({ phone, tab: memoryStore() });
  assert.equal(storage.buyer(), undefined);
  storage.saveBuyer({ name: "Arjun", phone: "98765 43210" });
  assert.deepEqual(
    createCheckoutStorage({ phone, tab: memoryStore() }).buyer(),
    { name: "Arjun", phone: "98765 43210" },
  );
});

test("the rest of the form stays in the tab, for each store, until the order", () => {
  const tab = memoryStore();
  const storage = createCheckoutStorage({ phone: memoryStore(), tab });
  const draft = {
    ...emptyDraft,
    fulfilment: "delivery" as const,
    address: "Jayanagar 4th Block",
  };
  storage.saveDraft("shobhas-kitchen", draft);
  assert.deepEqual(storage.draft("shobhas-kitchen"), draft);
  assert.deepEqual(storage.draft("ghar-ki-mithai"), emptyDraft);
  storage.clearDraft("shobhas-kitchen");
  assert.deepEqual(storage.draft("shobhas-kitchen"), emptyDraft);
});

test("broken or blocked storage gives empty values and never throws", () => {
  const tab = memoryStore();
  tab.items.set("checkout:shobhas-kitchen", "{not json");
  const reports: string[] = [];
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  const storage = createCheckoutStorage({
    phone: blocked,
    tab,
    report: (message) => reports.push(message),
  });
  assert.deepEqual(storage.draft("shobhas-kitchen"), emptyDraft);
  assert.equal(storage.buyer(), undefined);
  storage.saveBuyer({ name: "Arjun", phone: "98765 43210" });
  assert.equal(reports.length, 2);
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
