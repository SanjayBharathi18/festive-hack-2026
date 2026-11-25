import type { Day } from "../../shared/day.ts";
import type { LimitUnit } from "../../shared/model.ts";
import type { DayWarning } from "../../shared/orders.ts";
import type { DraftCapacity } from "../../shared/reading.ts";
import type { DayReason, DaysResponse } from "../../shared/store.ts";
import type { Text, TextKey } from "../text/text.ts";
import { amountOf } from "./amounts.ts";

export type DayNotice = {
  day: Day;
  fits: boolean;
  reason: DayReason | null;
  spaceLeft: number | null;
  next: Day | null;
};

const reasonWords: Record<DayReason, TextKey> = {
  full: "desk.notice.full",
  not_enough_space: "desk.notice.not_enough_space",
  closed: "desk.notice.closed",
  not_working: "desk.notice.not_working",
  after_last_day: "desk.notice.after_last_day",
  not_taking_orders: "desk.notice.not_taking_orders",
};

export function noticeFromCapacity(capacity: DraftCapacity): DayNotice {
  return {
    day: capacity.day,
    fits: capacity.fits,
    reason: capacity.reason,
    spaceLeft: capacity.space_left,
    next: capacity.fits ? null : capacity.next_free_day,
  };
}

// The check of the day she chose, from the days that fit the draft's cart.
// The next day is the first one after hers with space, as the reading gives.
export function noticeFromDays(
  days: DaysResponse,
  day: Day,
): DayNotice | undefined {
  const check = days.days.find((entry) => entry.day === day);
  if (check === undefined) return undefined;
  return {
    day,
    fits: check.fits,
    reason: check.reason,
    spaceLeft: check.space_left,
    next: check.fits
      ? null
      : (days.days.find((entry) => entry.day > day && entry.fits)?.day ?? null),
  };
}

export function noticeFromWarning(warning: DayWarning): DayNotice {
  return {
    day: warning.day,
    fits: false,
    reason: warning.reason,
    spaceLeft: warning.space_left,
    next: warning.next_free_day,
  };
}

// The warning in her words: what is wrong with the day, then the next day
// with space. She decides; the app only tells.
export function noticeWords(
  notice: DayNotice,
  {
    need,
    unit,
    text,
    dayName,
  }: {
    need: number;
    unit: LimitUnit;
    text: Text;
    dayName: (day: Day) => string;
  },
): { problem: string; next: string } {
  return {
    problem:
      notice.reason === null
        ? ""
        : text.t(reasonWords[notice.reason], {
            day: dayName(notice.day),
            left: amountOf(unit, notice.spaceLeft ?? 0, text),
            need: amountOf(unit, need, text),
          }),
    next:
      notice.next === null
        ? text.t("desk.notice.none")
        : text.t("desk.notice.next", { day: dayName(notice.next) }),
  };
}
