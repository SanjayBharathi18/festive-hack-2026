import type { Day } from "../../shared/day.ts";
import type { Point } from "../../shared/geo.ts";
import type { SearchSort } from "../../shared/search.ts";

// rating: her average, or null while she has no rating.
export type Ranked = {
  name: string;
  taking_orders: boolean;
  distance: number | null;
  rating: number | null;
  next_free_day: Day | null;
};

// A cook who takes no orders now comes last in both sorts. Nearest first
// measures from the buyer's location or from the centre of her city; with
// neither, the next day with space decides. Best rated first orders by the
// average, highest first, and puts the cooks with no rating after the rated
// ones. In both sorts, the next day with space breaks a tie.
export function rankStores<T extends Ranked>(
  stores: readonly T[],
  sort: SearchSort,
): T[] {
  return [...stores].sort(
    (a, b) =>
      Number(b.taking_orders) - Number(a.taking_orders) ||
      (sort === "distance" ? byDistance(a, b) : byRating(a, b)) ||
      byNextDay(a, b) ||
      a.name.localeCompare(b.name, "en"),
  );
}

// With a Need it by day, the cooks with space by that day. When none has
// space by then, the cooks with the nearest later days, so the buyer still
// sees who can make it.
export function byNeedBy<T extends Pick<Ranked, "next_free_day">>(
  stores: readonly T[],
  needBy: Day | null,
): { stores: T[]; met: boolean } {
  if (needBy === null) return { stores: [...stores], met: true };
  const inTime = stores.filter(
    (store) => store.next_free_day !== null && store.next_free_day <= needBy,
  );
  if (inTime.length > 0) return { stores: inTime, met: true };
  return {
    stores: stores
      .filter((store) => store.next_free_day !== null)
      .sort((a, b) => byNextDay(a, b)),
    met: false,
  };
}

// Whole kilometres, at least 1: the page needs no more, and a finer number
// would help to find her kitchen, which stays private.
export function roundedKm(km: number): number {
  return Math.max(1, Math.round(km));
}

export const pinCellDegrees = 0.01;

// The middle of the grid cell (0.01°, about 1 km) of her pin. Distances
// start here, not at her pin: from the exact pin, a buyer who searches from
// chosen places could find where a rounded distance changes, and so find
// her home.
export function pinCell({ lat, lng }: Point): Point {
  const middle = (degrees: number) =>
    (Math.floor(degrees / pinCellDegrees) + 0.5) * pinCellDegrees;
  return { lat: middle(lat), lng: middle(lng) };
}

function byDistance(a: Ranked, b: Ranked): number {
  if (a.distance === null || b.distance === null) {
    return Number(a.distance === null) - Number(b.distance === null);
  }
  return a.distance - b.distance;
}

function byRating(a: Ranked, b: Ranked): number {
  if (a.rating === null || b.rating === null) {
    return Number(a.rating === null) - Number(b.rating === null);
  }
  return b.rating - a.rating;
}

function byNextDay(
  a: Pick<Ranked, "next_free_day">,
  b: Pick<Ranked, "next_free_day">,
): number {
  if (a.next_free_day === null || b.next_free_day === null) {
    return Number(a.next_free_day === null) - Number(b.next_free_day === null);
  }
  return a.next_free_day.localeCompare(b.next_free_day);
}
