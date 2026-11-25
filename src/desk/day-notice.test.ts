import assert from "node:assert/strict";
import { test } from "node:test";
import type { DaysResponse } from "../../shared/store.ts";
import { createText } from "../text/text.ts";
import {
  noticeFromCapacity,
  noticeFromDays,
  noticeFromWarning,
  noticeWords,
} from "./day-notice.ts";

const days: DaysResponse = {
  today: "2026-11-24",
  limit_unit: "kg",
  cart_load: 2500,
  next_free_day: "2026-11-24",
  days: [
    { day: "2026-11-24", fits: true, reason: null, space_left: 25_000 },
    {
      day: "2026-11-28",
      fits: false,
      reason: "not_enough_space",
      space_left: 2000,
    },
    { day: "2026-11-29", fits: true, reason: null, space_left: 16_000 },
  ],
};

test("the reading's check of its day becomes the notice", () => {
  assert.deepEqual(
    noticeFromCapacity({
      day: "2026-11-28",
      fits: false,
      reason: "not_enough_space",
      space_left: 2000,
      next_free_day: "2026-11-29",
    }),
    {
      day: "2026-11-28",
      fits: false,
      reason: "not_enough_space",
      spaceLeft: 2000,
      next: "2026-11-29",
    },
  );
});

test("a day that does not fit points to the next day after it with space", () => {
  assert.deepEqual(noticeFromDays(days, "2026-11-28"), {
    day: "2026-11-28",
    fits: false,
    reason: "not_enough_space",
    spaceLeft: 2000,
    next: "2026-11-29",
  });
});

test("a day that fits needs no next day", () => {
  assert.equal(noticeFromDays(days, "2026-11-29")?.next, null);
  assert.equal(noticeFromDays(days, "2026-11-29")?.fits, true);
});

test("no later day with space gives no next day, and an unknown day no notice", () => {
  const full: DaysResponse = {
    ...days,
    days: days.days.map((day) => ({ ...day, fits: false, reason: "full" })),
  };
  assert.equal(noticeFromDays(full, "2026-11-28")?.next, null);
  assert.equal(noticeFromDays(days, "2026-12-30"), undefined);
});

test("a warning after a change is a notice that does not fit", () => {
  assert.deepEqual(
    noticeFromWarning({
      day: "2026-11-28",
      reason: "full",
      space_left: 0,
      next_free_day: null,
    }),
    {
      day: "2026-11-28",
      fits: false,
      reason: "full",
      spaceLeft: 0,
      next: null,
    },
  );
});

test("the notice says what is wrong with the day, then the next day with space", () => {
  const words = noticeWords(
    {
      day: "2026-11-28",
      fits: false,
      reason: "not_enough_space",
      spaceLeft: 2000,
      next: "2026-11-29",
    },
    {
      need: 2500,
      unit: "kg",
      text: createText("en"),
      dayName: (day) => (day === "2026-11-28" ? "Saturday" : "Sunday"),
    },
  );
  assert.deepEqual(words, {
    problem: "Saturday has 2 kg left. This order needs 2.5 kg.",
    next: "Next day with space: Sunday",
  });
  assert.equal(
    noticeWords(
      {
        day: "2026-11-28",
        fits: false,
        reason: "full",
        spaceLeft: 0,
        next: null,
      },
      {
        need: 1,
        unit: "orders",
        text: createText("en"),
        dayName: () => "Saturday",
      },
    ).next,
    "No day has space in the next 3 weeks.",
  );
});
