import { addDays, weekday, type Day } from "../../shared/day.ts";
import type { LimitUnit, OrderStatus } from "../../shared/model.ts";
import type { DayCheck, DayReason } from "../../shared/store.ts";

export type Amount = {
  quantity: number;
  grams: number | null;
  pieces: number | null;
};

export type BookedOrder = {
  day: Day;
  status: OrderStatus;
  lines: readonly Amount[];
};

export type DayRules = {
  taking_orders: boolean;
  limit_unit: LimitUnit;
  daily_limit: number | null;
  working_days: number;
  last_order_day: Day | null;
  closed_dates: ReadonlySet<Day>;
};

export type DayLoads = ReadonlyMap<Day, number>;

export function checkDays(
  rules: DayRules,
  loads: DayLoads,
  cart: readonly Amount[],
  from: Day,
  until: Day,
): DayCheck[] {
  const checks: DayCheck[] = [];
  for (let day = from; day <= until; day = addDays(day, 1)) {
    checks.push(checkDay(rules, loads, cart, day));
  }
  return checks;
}

export function nextFreeDay(
  rules: DayRules,
  loads: DayLoads,
  cart: readonly Amount[],
  from: Day,
  until: Day,
): Day | null {
  for (let day = from; day <= until; day = addDays(day, 1)) {
    if (checkDay(rules, loads, cart, day).fits) return day;
  }
  return null;
}

export function checkDay(
  rules: DayRules,
  loads: DayLoads,
  cart: readonly Amount[],
  day: Day,
): DayCheck {
  const closed = closedReason(rules, day);
  if (closed !== null) {
    return { day, fits: false, reason: closed, space_left: null };
  }
  if (rules.daily_limit === null) {
    return { day, fits: true, reason: null, space_left: null };
  }
  const space_left = Math.max(0, rules.daily_limit - (loads.get(day) ?? 0));
  if (space_left === 0) return { day, fits: false, reason: "full", space_left };
  if (cartLoad(rules.limit_unit, cart) > space_left) {
    return { day, fits: false, reason: "not_enough_space", space_left };
  }
  return { day, fits: true, reason: null, space_left };
}

export function dayLoads(
  unit: LimitUnit,
  orders: readonly BookedOrder[],
): Map<Day, number> {
  const loads = new Map<Day, number>();
  for (const order of orders) {
    loads.set(order.day, (loads.get(order.day) ?? 0) + orderLoad(unit, order));
  }
  return loads;
}

export function orderLoad(
  unit: LimitUnit,
  order: { status: OrderStatus; lines: readonly Amount[] },
): number {
  return addsLoad(order.status) ? cartLoad(unit, order.lines) : 0;
}

export function addsLoad(status: OrderStatus): boolean {
  return status !== "cancelled" && status !== "expired";
}

// A pack with no weight in a kg store, or no pieces in a pieces store, adds
// nothing: setup gives each pack the amount that her limit counts.
export function cartLoad(unit: LimitUnit, lines: readonly Amount[]): number {
  if (unit === "orders") return 1;
  return lines.reduce(
    (load, line) =>
      load + line.quantity * ((unit === "kg" ? line.grams : line.pieces) ?? 0),
    0,
  );
}

function closedReason(rules: DayRules, day: Day): DayReason | null {
  if (!rules.taking_orders) return "not_taking_orders";
  if (rules.last_order_day !== null && day > rules.last_order_day) {
    return "after_last_day";
  }
  if ((rules.working_days & (1 << weekday(day))) === 0) return "not_working";
  if (rules.closed_dates.has(day)) return "closed";
  return null;
}
