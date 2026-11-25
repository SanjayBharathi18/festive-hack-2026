import { addDays, type Day } from "../../shared/day.ts";
import type { DayWarning } from "../../shared/orders.ts";
import { checkDay, nextFreeDay, type Amount } from "../capacity/capacity.ts";
import type { Db } from "../db/database.ts";
import {
  dayWindow,
  readCapacity,
  type CapacityStore,
} from "../stores/store-capacity.ts";

export function daySpace(
  db: Db,
  store: CapacityStore,
  day: Day,
  lines: readonly Amount[],
  exceptOrderId?: string,
): DayWarning | null {
  const until = addDays(day, dayWindow);
  const { rules, loads } = readCapacity(db, store, day, until, {
    exceptOrderId,
  });
  const check = checkDay(rules, loads, lines, day);
  if (check.fits) return null;
  return {
    day,
    reason: check.reason ?? "full",
    space_left: check.space_left,
    next_free_day: nextFreeDay(rules, loads, lines, addDays(day, 1), until),
  };
}

export function sellerDaySpace(
  db: Db,
  store: CapacityStore,
  day: Day,
  lines: readonly Amount[],
  exceptOrderId?: string,
): DayWarning | null {
  return daySpace(
    db,
    { ...store, paused: false, normal_orders_on: true },
    day,
    lines,
    exceptOrderId,
  );
}
