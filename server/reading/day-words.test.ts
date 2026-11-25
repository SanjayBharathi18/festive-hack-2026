import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDay } from "./day-words.ts";

const tuesday = "2026-11-24";

test("today, tomorrow and the day after are counted from today", () => {
  assert.equal(resolveDay(tuesday, "today", null), "2026-11-24");
  assert.equal(resolveDay(tuesday, "tomorrow", null), "2026-11-25");
  assert.equal(resolveDay(tuesday, "day_after_tomorrow", null), "2026-11-26");
  assert.equal(resolveDay(tuesday, "none", null), null);
});

test("a weekday is the next such day after today", () => {
  assert.equal(resolveDay(tuesday, "wednesday", null), "2026-11-25");
  assert.equal(resolveDay(tuesday, "saturday", null), "2026-11-28");
  assert.equal(resolveDay(tuesday, "sunday", null), "2026-11-29");
  assert.equal(resolveDay(tuesday, "tuesday", null), "2026-12-01");
  assert.equal(resolveDay(tuesday, "monday", null), "2026-11-30");
});

test("next and a weekday is that day in the next week, from Monday", () => {
  assert.equal(resolveDay(tuesday, "next_tuesday", null), "2026-12-01");
  assert.equal(resolveDay(tuesday, "next_wednesday", null), "2026-12-02");
  assert.equal(resolveDay(tuesday, "next_sunday", null), "2026-12-06");
  assert.equal(resolveDay("2026-11-29", "next_monday", null), "2026-11-30");
  assert.equal(resolveDay("2026-11-28", "next_tuesday", null), "2026-12-01");
});

test("a calendar date is kept only when it is valid and not in the past", () => {
  assert.equal(resolveDay(tuesday, "date", "2026-12-05"), "2026-12-05");
  assert.equal(resolveDay(tuesday, "date", tuesday), tuesday);
  assert.equal(resolveDay(tuesday, "date", "2026-11-20"), null);
  assert.equal(resolveDay(tuesday, "date", "5 December"), null);
  assert.equal(resolveDay(tuesday, "date", null), null);
});
