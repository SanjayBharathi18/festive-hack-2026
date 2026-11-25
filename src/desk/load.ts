import type { LimitUnit, OrderStatus } from "../../shared/model.ts";

export type Amount = {
  quantity: number;
  grams: number | null;
  pieces: number | null;
};
export type Booked = { status: OrderStatus; lines: readonly Amount[] };
export type Segment = "booked" | "draft" | "open";

export const maxSegments = 25;

export function dayLoad(unit: LimitUnit, orders: readonly Booked[]): number {
  return orders.reduce(
    (load, order) =>
      load + (addsLoad(order.status) ? cartLoad(unit, order.lines) : 0),
    0,
  );
}

// The same rules as server/capacity/capacity.ts, so that a gauge changes in
// the frame that a slip changes, before the server answers.
export function addsLoad(status: OrderStatus): boolean {
  return status !== "cancelled" && status !== "expired";
}

export function cartLoad(unit: LimitUnit, lines: readonly Amount[]): number {
  if (unit === "orders") return 1;
  return lines.reduce(
    (load, line) =>
      load + line.quantity * ((unit === "kg" ? line.grams : line.pieces) ?? 0),
    0,
  );
}

export function spaceLeft(limit: number | null, load: number): number | null {
  return limit === null ? null : Math.max(0, limit - load);
}

// One segment for each unit of the limit, 25 at most. All segments are ink
// only on a full day, and a load or a draft always shows at least one segment.
export function gaugeSegments(
  unit: LimitUnit,
  limit: number,
  load: number,
  draft = 0,
): Segment[] {
  const count = Math.min(
    maxSegments,
    Math.max(1, Math.ceil(limit / (unit === "kg" ? 1000 : 1))),
  );
  const per = limit / count;
  const full = load >= limit;
  const booked = full
    ? count
    : clamp(Math.round(load / per), load > 0 ? 1 : 0, count - 1);
  let drafted = 0;
  if (draft > 0 && !full) {
    const end =
      load + draft >= limit
        ? count
        : clamp(Math.round((load + draft) / per), booked + 1, count - 1);
    drafted = Math.max(1, Math.min(count, end) - booked);
  }
  return Array.from({ length: count }, (_, index) =>
    index < booked ? "booked" : index < booked + drafted ? "draft" : "open",
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
