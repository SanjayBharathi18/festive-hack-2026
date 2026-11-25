import assert from "node:assert/strict";
import { test } from "node:test";
import { catererQuery } from "./caterer-query.ts";

const none = { date: "", guests: "", maxRupees: "", food: "" } as const;

test("no filters give no query", () => {
  assert.equal(catererQuery(none), "");
});

test("each filter goes in, with the price in paise", () => {
  assert.equal(
    catererQuery({
      date: "2026-12-05",
      guests: "120",
      maxRupees: "400",
      food: "jain",
    }),
    "?date=2026-12-05&guests=120&max_price=40000&food=jain",
  );
});

test("wrong or partial values are left out", () => {
  assert.equal(
    catererQuery({
      date: "2026-12",
      guests: "12.5",
      maxRupees: "-3",
      food: "",
    }),
    "",
  );
  assert.equal(catererQuery({ ...none, guests: " 150 " }), "?guests=150");
});

test("the city of the picker goes first", () => {
  assert.equal(
    catererQuery({ ...none, city: "mumbai", guests: "80" }),
    "?city=mumbai&guests=80",
  );
});
