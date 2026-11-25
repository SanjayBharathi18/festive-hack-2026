import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canOpen,
  draftSchema,
  goTo,
  newDraft,
  openStep,
  restoreItem,
  stepStates,
  storeBody,
  withItem,
  withoutItem,
} from "./draft.ts";
import { chakkuli, readyDraft, storeId } from "./test-draft.ts";

test("a new draft opens on her language, and the later steps wait", () => {
  const draft = newDraft(storeId);
  assert.ok(draftSchema.safeParse(draft).success);
  assert.equal(openStep(draft), "language");
  assert.deepEqual(
    stepStates(draft).map(({ state }) => state),
    ["current", "locked", "locked", "locked", "locked", "locked", "locked"],
  );
  assert.equal(goTo(draft, "items"), draft);
});

test("each step opens when the steps before it are done", () => {
  const draft = readyDraft({ step: "ways", furthest: "ways" });
  assert.ok(canOpen(draft, "preview"));
  assert.equal(canOpen(draft, "publish"), false);
  const seen = goTo(goTo(draft, "preview"), "publish");
  assert.equal(seen.step, "publish");
  assert.equal(seen.furthest, "publish");
  assert.equal(goTo(seen, "items").furthest, "publish");
  assert.equal(canOpen({ ...draft, slug: "Shobha" }, "ways"), false);
  assert.equal(canOpen({ ...draft, offers_pickup: false }, "preview"), false);
});

test("a step that closed sends her back to the first open step", () => {
  const draft = readyDraft({ step: "ways", items: [] });
  assert.equal(openStep(draft), "items");
});

test("after publish only the share step opens", () => {
  const draft = readyDraft({
    published: {
      slug: "shobhas-kitchen",
      name: "Shobha's Kitchen",
      url: "http://localhost:8093/s/shobhas-kitchen",
    },
  });
  assert.equal(openStep(draft), "share");
  assert.equal(canOpen(draft, "items"), false);
  assert.equal(stepStates(goTo(draft, "share")).at(-1)?.state, "current");
  assert.equal(stepStates(draft)[0]?.state, "done");
});

test("an item is added, changed in place, removed and put back", () => {
  const laddu = chakkuli({
    id: "33333333-3333-4333-8333-333333333333",
    name: "Laddu",
  });
  let draft = withItem(withItem(newDraft(storeId), chakkuli()), laddu);
  draft = withItem(draft, chakkuli({ name: "Chakli" }));
  assert.deepEqual(
    draft.items.map((item) => item.name),
    ["Chakli", "Laddu"],
  );
  const removed = withoutItem(draft, chakkuli().id);
  assert.deepEqual(
    removed.items.map((item) => item.name),
    ["Laddu"],
  );
  const back = restoreItem(removed, chakkuli({ name: "Chakli" }), 0);
  assert.deepEqual(
    back.items.map((item) => item.name),
    ["Chakli", "Laddu"],
  );
  assert.equal(restoreItem(back, laddu, 0), back);
});

test("the store body trims her words and keeps the address only for pickup", () => {
  const draft = readyDraft({
    name: "  Shobha's Kitchen ",
    address: " 12, 4th Cross ",
    location: { lat: 12.94, lng: 77.57 },
  });
  assert.deepEqual(storeBody(draft), {
    language: "kn",
    name: "Shobha's Kitchen",
    slug: "shobhas-kitchen",
    offers_pickup: true,
    offers_delivery: false,
    area: "Basavanagudi",
    city: "Bengaluru",
    address: "12, 4th Cross",
    location: { lat: 12.94, lng: 77.57 },
  });
  assert.equal(
    storeBody({ ...draft, offers_pickup: false, offers_delivery: true })
      .address,
    null,
  );
  assert.equal(storeBody({ ...draft, address: "  " }).address, null);
});

test("a stored draft that is broken does not parse", () => {
  assert.equal(
    draftSchema.safeParse({ ...readyDraft(), step: "pay" }).success,
    false,
  );
  assert.equal(
    draftSchema.safeParse({ ...readyDraft(), photo: "https://x/y.jpg" })
      .success,
    false,
  );
});
