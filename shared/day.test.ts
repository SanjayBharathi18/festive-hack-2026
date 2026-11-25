import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, daySchema, istDay, weekday } from "./day.ts";

test("a day is a real calendar date as YYYY-MM-DD", () => {
  assert.equal(daySchema.parse("2026-11-24"), "2026-11-24");
  assert.equal(daySchema.safeParse("2026-02-30").success, false);
  assert.equal(daySchema.safeParse("24-11-2026").success, false);
});

test("istDay gives the calendar day in India", () => {
  assert.equal(istDay(Date.parse("2026-11-24T18:29:59Z")), "2026-11-24");
  assert.equal(istDay(Date.parse("2026-11-24T18:30:00Z")), "2026-11-25");
  assert.equal(istDay(Date.parse("2026-11-23T18:30:00Z")), "2026-11-24");
});

test("addDays crosses months and years", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("weekday numbers the days from Sunday (0) to Saturday (6)", () => {
  assert.equal(weekday("2026-11-22"), 0);
  assert.equal(weekday("2026-11-24"), 2);
  assert.equal(weekday("2026-11-28"), 6);
});
