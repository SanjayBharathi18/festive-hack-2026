import assert from "node:assert/strict";
import { test } from "node:test";
import { publicStoreSchema } from "../../shared/store.ts";
import { previewSections, previewStore } from "./preview.ts";
import { chakkuli, readyDraft } from "./test-draft.ts";

test("the preview store is her draft as buyers will see it", () => {
  const store = previewStore(readyDraft({ area: " Basavanagudi ", city: "" }));
  assert.ok(publicStoreSchema.safeParse(store).success);
  assert.equal(store.area, "Basavanagudi");
  assert.equal(store.city, null);
  assert.equal(store.paused, false);
  assert.equal(store.normal_orders_on, true);
});

test("the preview menu has the sections of the store page, packs by size", () => {
  const laddu = chakkuli({
    id: "33333333-3333-4333-8333-333333333333",
    name: "Laddu",
    category: "sweets",
  });
  const sections = previewSections([chakkuli(), laddu]);
  assert.deepEqual(
    sections.map((section) => section.category),
    ["sweets", "savouries"],
  );
  assert.deepEqual(
    sections[1]?.items[0]?.packs.map((pack) => pack.grams),
    [250, 1000],
  );
  assert.equal(sections[1]?.items[0]?.sold_out, false);
  assert.deepEqual(previewSections([]), []);
});
