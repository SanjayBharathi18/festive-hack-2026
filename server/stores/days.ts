import type { Day } from "../../shared/day.ts";
import type { CartLine, DaysResponse, MenuItem } from "../../shared/store.ts";
import { cartLoad, checkDays, type Amount } from "../capacity/capacity.ts";
import type { StoreCapacity } from "./store-capacity.ts";

export function daysForCart(
  { rules, loads }: StoreCapacity,
  cart: readonly Amount[],
  today: Day,
  until: Day,
): DaysResponse {
  const days = checkDays(rules, loads, cart, today, until);
  return {
    today,
    limit_unit: rules.limit_unit,
    cart_load: cartLoad(rules.limit_unit, cart),
    days,
    next_free_day: days.find(({ fits }) => fits)?.day ?? null,
  };
}

export function cartAmounts(
  menu: readonly MenuItem[],
  cart: readonly CartLine[],
): { lines: Amount[]; missing: string[] } {
  const packs = new Map(
    menu.flatMap(({ packs }) => packs.map((pack) => [pack.id, pack])),
  );
  const lines: Amount[] = [];
  const missing: string[] = [];
  for (const { pack_id, quantity } of cart) {
    const pack = packs.get(pack_id);
    if (pack === undefined) missing.push(pack_id);
    else lines.push({ quantity, grams: pack.grams, pieces: pack.pieces });
  }
  return { lines, missing };
}
