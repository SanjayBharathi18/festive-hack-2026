import type { Day } from "../../shared/day.ts";
import type { DailyList } from "../../shared/orders.ts";
import type { TextKey } from "../text/text.ts";

export type KhataDay = DailyList["days"][number];

// The days that the khata offers: today, each day with orders, each day that
// she closed, and the day that she picked, soonest first, so that the khata
// opens on today. A day with no orders has nothing to make. Whether a day is
// closed comes from her stock, which changes the moment she touches it.
export function khataDays(
  list: Pick<DailyList, "today" | "daily_limit" | "days">,
  closed: readonly Day[],
  picked: Day | undefined,
): KhataDay[] {
  const shut = new Set(closed);
  const days = new Map(list.days.map((day) => [day.day, day]));
  const extra = [
    list.today,
    ...closed,
    ...(picked === undefined ? [] : [picked]),
  ];
  for (const day of extra) {
    if (day >= list.today && !days.has(day)) {
      days.set(day, emptyDay(day, list.daily_limit));
    }
  }
  return [...days.values()]
    .map((day) => ({ ...day, closed: shut.has(day.day) }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

function emptyDay(day: Day, limit: number | null): KhataDay {
  return {
    day,
    load: 0,
    space_left: limit,
    closed: false,
    orders: 0,
    items: [],
    value: 0,
    paid: 0,
    owed: 0,
  };
}

// A day that she did not close can still be full, and then buyers cannot
// choose it either.
export function closeStateOf(
  day: Pick<KhataDay, "closed" | "space_left">,
): TextKey {
  if (day.closed) return "desk.daily.closed_state";
  if (day.space_left === 0) return "desk.daily.full_state";
  return "desk.daily.open_state";
}
