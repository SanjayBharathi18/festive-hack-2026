import assert from "node:assert/strict";
import { test } from "node:test";
import { createText } from "../text/text.ts";
import { availability, ratingWords, shopKind } from "./cook-words.ts";

const names = {
  sweets: "Sweets",
  snacks: "Snacks",
  savouries: "Savouries",
  meals: "Meals",
} as const;
const name = (category: keyof typeof names) => names[category];

test("the pill says today, a later day, full or not taking orders", () => {
  const today = "2026-11-25";
  const open = { taking_orders: true };
  assert.deepEqual(availability({ ...open, next_free_day: today }, today), {
    state: "today",
  });
  assert.deepEqual(
    availability({ ...open, next_free_day: "2026-11-28" }, today),
    { state: "later", day: "2026-11-28" },
  );
  assert.deepEqual(availability({ ...open, next_free_day: null }, today), {
    state: "full",
  });
  assert.deepEqual(
    availability({ taking_orders: false, next_free_day: today }, today),
    { state: "closed" },
  );
});

test("the kind of shop reads as one phrase in sentence case", () => {
  assert.equal(
    shopKind(["sweets", "savouries"], name, "en"),
    "Sweets and savouries",
  );
  assert.equal(shopKind(["meals"], name, "en"), "Meals");
  assert.equal(shopKind([], name, "en"), "");
  assert.equal(
    shopKind(
      ["sweets", "snacks"],
      (category) =>
        ({ sweets: "ಸಿಹಿ", snacks: "ತಿಂಡಿ" })[category as "sweets" | "snacks"],
      "kn",
    ),
    new Intl.ListFormat("kn-IN", { type: "conjunction" }).format(["ಸಿಹಿ", "ತಿಂಡಿ"]),
  );
});

test("a rating shows its average, and a screen reader also hears the count; a new cook is New", () => {
  const text = createText("en");
  assert.deepEqual(ratingWords({ average: 4.6, count: 1280 }, text), {
    spoken: "Rated 4.6 out of 5, from 1,280 ratings",
    average: "4.6",
  });
  assert.equal(
    ratingWords({ average: 5, count: 1 }, text).spoken,
    "Rated 5.0 out of 5, from 1 rating",
  );
  assert.deepEqual(ratingWords(null, text), {
    spoken: "New cook, no rating yet",
    average: null,
  });
});
