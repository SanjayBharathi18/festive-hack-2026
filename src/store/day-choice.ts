import { addDays, type Day } from "../../shared/day.ts";
import type { DayReason, DaysResponse } from "../../shared/store.ts";
import type { Cart } from "../cart/cart.ts";

export type DayNote = "today" | "tomorrow";
export type DayOption = {
  day: Day;
  fits: boolean;
  reason: DayReason | null;
  note: DayNote | null;
};
export type ResolvedDay = {
  day: Day | null;
  missed: { day: Day; reason: DayReason | null } | null;
};

// A day she does not work, a day after her last day for orders, and the days
// of a store that takes no orders are not choices, so the list leaves them out.
const notChoices: ReadonlySet<DayReason> = new Set([
  "not_working",
  "after_last_day",
  "not_taking_orders",
]);

export function dayOptions(days: DaysResponse): DayOption[] {
  return days.days
    .filter(({ reason }) => reason === null || !notChoices.has(reason))
    .map(({ day, fits, reason }) => ({
      day,
      fits,
      reason,
      note: dayNote(day, days.today),
    }));
}

// Today and tomorrow have words; other days show their date.
export function dayNote(day: Day, today: Day): DayNote | null {
  if (day === today) return "today";
  return day === addDays(today, 1) ? "tomorrow" : null;
}

// With no day picked, the cart goes to the next day with space. A day that the
// buyer or the voice note picked stays picked while the cart fits on it. When
// it no longer fits, the buyer picks again; the app does not pick for her.
export function resolveDay(
  cart: Pick<Cart, "day" | "picked_by">,
  days: DaysResponse,
): ResolvedDay {
  const wanted = cart.picked_by === null ? null : cart.day;
  if (wanted === null || wanted < days.today) {
    return { day: days.next_free_day, missed: null };
  }
  const check = days.days.find(({ day }) => day === wanted);
  if (check?.fits) return { day: wanted, missed: null };
  return { day: null, missed: { day: wanted, reason: check?.reason ?? null } };
}

export function isCapacityReason(reason: DayReason | null): boolean {
  return reason === "full" || reason === "not_enough_space";
}

// A day that the buyer or the voice note picked stopped fitting with the
// newest answer of the day check, because packs were added. The first answer
// of a page load has nothing before it, so it plays nothing.
export function stoppedFitting(
  before: ResolvedDay | undefined,
  after: ResolvedDay,
): boolean {
  return (
    before !== undefined && before.missed === null && after.missed !== null
  );
}
