import assert from "node:assert/strict";
import { test } from "node:test";
import { createText } from "../text/text.ts";
import { offerLimits, otherWaysTag, styleWords } from "./offer-words.ts";

const text = createText("en");
const plain = (words: string) =>
  words.replace(/\u00a0/g, " ").replace(/\u2060/g, "");

test("the limits of a package read as one line, with one number when the fewest is the most", () => {
  const words = offerLimits(
    {
      free_choice: false,
      max_total: 9,
      limits: [
        { name: "Sweets", min: 1, max: 2 },
        { name: "Starters", min: 0, max: 2 },
        { name: "Breads", min: 1, max: 1 },
        { name: "Rice", min: 1, max: null },
      ],
    },
    text,
  );
  assert.equal(
    plain(words),
    "Sweets 1–2 · Starters up to 2 · Breads 1 · Rice from 1 · 9 dishes",
  );
  assert.match(words, /Sweets\u00a01\u2060–\u20602/, "1–2 stays on one line");
  assert.equal(
    offerLimits({ free_choice: true, max_total: null, limits: [] }, text),
    "Free choice",
  );
});

test("the service styles are one choice: delivery, serving staff or live counters", () => {
  assert.equal(
    styleWords(["delivery", "staff", "live_counters"], text),
    "Service: delivery, serving staff or live counters",
  );
  assert.equal(styleWords(["staff"], text), "Service: serving staff");
});

test("a store with no food orders but with catering or bulk gets its own tag", () => {
  const off = { normal_orders_on: false, paused: false };
  assert.equal(otherWaysTag(off, false, true), "catering.store.only");
  assert.equal(otherWaysTag(off, true, true), "catering.store.only_with_bulk");
  assert.equal(otherWaysTag(off, true, false), "bulk.store.only");
  assert.equal(otherWaysTag(off, false, false), undefined);
  assert.equal(
    otherWaysTag({ normal_orders_on: true, paused: false }, true, true),
    undefined,
  );
  assert.equal(
    otherWaysTag({ normal_orders_on: false, paused: true }, false, true),
    undefined,
    "a paused store keeps Not taking orders",
  );
});
