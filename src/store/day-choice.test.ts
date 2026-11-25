import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "../../shared/day.ts";
import type { DayCheck, DaysResponse } from "../../shared/store.ts";
import {
  dayNote,
  dayOptions,
  isCapacityReason,
  resolveDay,
  stoppedFitting,
} from "./day-choice.ts";

const today = "2026-11-24";
const saturday = "2026-11-28";

test("the list keeps working days, closed or not, and leaves out the rest", () => {
  const days = response([
    open(today),
    open(addDays(today, 1)),
    {
      day: addDays(today, 2),
      fits: false,
      reason: "not_working",
      space_left: null,
    },
    { day: addDays(today, 3), fits: false, reason: "closed", space_left: null },
    { day: saturday, fits: false, reason: "full", space_left: 0 },
    {
      day: addDays(today, 5),
      fits: false,
      reason: "not_enough_space",
      space_left: 2000,
    },
    {
      day: addDays(today, 6),
      fits: false,
      reason: "after_last_day",
      space_left: null,
    },
  ]);
  assert.deepEqual(
    dayOptions(days).map(({ day, fits, reason, note }) => [
      day,
      fits,
      reason,
      note,
    ]),
    [
      [today, true, null, "today"],
      [addDays(today, 1), true, null, "tomorrow"],
      [addDays(today, 3), false, "closed", null],
      [saturday, false, "full", null],
      [addDays(today, 5), false, "not_enough_space", null],
    ],
  );
});

test("a store that takes no orders has no day to choose", () => {
  const days = response(
    [0, 1, 2].map((offset) => ({
      day: addDays(today, offset),
      fits: false,
      reason: "not_taking_orders" as const,
      space_left: null,
    })),
    null,
  );
  assert.deepEqual(dayOptions(days), []);
});

test("with no day picked, the cart goes to the next day with space", () => {
  const days = response([open(today), open(saturday)], today);
  assert.deepEqual(resolveDay({ day: null, picked_by: null }, days), {
    day: today,
    missed: null,
  });
  assert.deepEqual(resolveDay({ day: saturday, picked_by: null }, days), {
    day: today,
    missed: null,
  });
});

test("a picked day stays while the cart fits on it", () => {
  const days = response([open(today), open(saturday)], today);
  assert.deepEqual(resolveDay({ day: saturday, picked_by: "buyer" }, days), {
    day: saturday,
    missed: null,
  });
});

test("a picked day that no longer fits asks the buyer to pick again", () => {
  const days = response(
    [
      open(today),
      {
        day: saturday,
        fits: false,
        reason: "not_enough_space",
        space_left: 2000,
      },
    ],
    today,
  );
  assert.deepEqual(resolveDay({ day: saturday, picked_by: "voice" }, days), {
    day: null,
    missed: { day: saturday, reason: "not_enough_space" },
  });
});

test("a picked day that has passed falls back to the next day with space", () => {
  const days = response([open(today)], today);
  assert.deepEqual(
    resolveDay({ day: "2026-11-20", picked_by: "buyer" }, days),
    {
      day: today,
      missed: null,
    },
  );
});

test("only full and not enough space are capacity reasons", () => {
  assert.equal(isCapacityReason("full"), true);
  assert.equal(isCapacityReason("not_enough_space"), true);
  assert.equal(isCapacityReason("closed"), false);
  assert.equal(isCapacityReason(null), false);
});

function open(day: string): DayCheck {
  return { day, fits: true, reason: null, space_left: 25000 };
}

function response(days: DayCheck[], next: string | null = today): DaysResponse {
  return { today, limit_unit: "kg", cart_load: 0, days, next_free_day: next };
}

test("a picked day that stops fitting after packs are added plays limit, once", () => {
  const fits = { day: "2026-11-28", missed: null };
  const missed = {
    day: null,
    missed: { day: "2026-11-28", reason: "not_enough_space" as const },
  };
  assert.equal(stoppedFitting(fits, missed), true);
  assert.equal(stoppedFitting(missed, missed), false);
  assert.equal(stoppedFitting(missed, fits), false);
  assert.equal(stoppedFitting(undefined, missed), false);
  assert.equal(stoppedFitting(fits, fits), false);
});

test("today and tomorrow have words, other days their date", () => {
  assert.equal(dayNote("2026-11-25", "2026-11-25"), "today");
  assert.equal(dayNote("2026-11-26", "2026-11-25"), "tomorrow");
  assert.equal(dayNote("2026-12-01", "2026-11-30"), "tomorrow");
  assert.equal(dayNote("2026-11-28", "2026-11-25"), null);
});
