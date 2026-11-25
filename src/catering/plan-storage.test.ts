import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlanStorage, type KeptPlan } from "./plan-storage.ts";

function memory() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const plan: KeptPlan = {
  package_id: "00000000-0000-4000-8000-000000000001",
  picks: [{ category: "Sweets", dish: "Gulab jamun" }],
  guests: "120",
  date: "2026-12-08",
  place: "Jayanagar 4th Block",
  style: "staff",
  sent: {
    store: "Daawat Caterers",
    whatsapp: "https://wa.me/910000000008?text=Hello",
  },
};

test("the plan of a caterer comes back after a reload, with its sent request", () => {
  const store = memory();
  const kept = createPlanStorage(store);
  kept.save("daawat-caterers", plan);
  assert.deepEqual(createPlanStorage(store).load("daawat-caterers"), plan);
  assert.equal(kept.load("other-caterer"), undefined);
});

test("a broken or strange kept plan gives none, and a full storage only reports", () => {
  const store = memory();
  const reports: string[] = [];
  const kept = createPlanStorage(store, (message) => reports.push(message));
  store.items.set("plan:a", "{not json");
  store.items.set(
    "plan:b",
    JSON.stringify({ v: 1, ...plan, sent: { store: "X", whatsapp: "x" } }),
  );
  assert.equal(kept.load("a"), undefined);
  assert.equal(kept.load("b"), undefined);
  const full = createPlanStorage(
    {
      ...store,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    },
    (message) => reports.push(message),
  );
  full.save("c", plan);
  assert.equal(reports.length, 2);
});
