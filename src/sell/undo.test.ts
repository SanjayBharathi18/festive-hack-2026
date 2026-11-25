import assert from "node:assert/strict";
import { test } from "node:test";
import { createUndo, type UndoOffer } from "./undo.ts";

test("an offer lasts 10 s, and Undo restores once", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const seen: (UndoOffer | undefined)[] = [];
  const undo = createUndo({ onChange: (offer) => seen.push(offer) });
  let restored = 0;
  undo.give({ words: "Chakkuli is removed.", restore: () => (restored += 1) });
  assert.equal(undo.offer?.words, "Chakkuli is removed.");
  undo.undo();
  undo.undo();
  assert.equal(restored, 1);
  assert.equal(undo.offer, undefined);
  undo.give({ words: "Laddu is removed.", restore: () => (restored += 1) });
  t.mock.timers.tick(9_999);
  assert.ok(undo.offer);
  t.mock.timers.tick(1);
  assert.equal(undo.offer, undefined);
  assert.equal(seen.length, 4);
});

test("a new removal ends the offer before it", () => {
  const undo = createUndo({ onChange: () => {} });
  const restored: string[] = [];
  undo.give({ words: "a", restore: () => restored.push("a") });
  undo.give({ words: "b", restore: () => restored.push("b") });
  undo.undo();
  assert.deepEqual(restored, ["b"]);
  undo.dismiss();
});
