import { Hono } from "hono";
import { z } from "zod";
import { addDays, daySchema, istDay, type Day } from "../../shared/day.ts";
import {
  closeAheadDays,
  closedDayBodySchema,
  pausedSchema,
  soldOutBodySchema,
  type ClosedDayAnswer,
  type Paused,
  type SoldOutAnswer,
} from "../../shared/desk.ts";
import type { RouteDeps } from "../app.ts";
import type { Db } from "../db/database.ts";
import type { AppEnv } from "../http/context.ts";
import { appError } from "../http/errors.ts";
import { parseInput, readJson } from "../http/input.ts";
import { farDayError, pastDayError } from "../orders/order-errors.ts";
import { deskAuth } from "../verify/desk-auth.ts";

type StockDeps = Pick<RouteDeps, "db" | "clock" | "config">;

// What she can stop on her desk with one touch: an item that ran out, all new
// orders, or one day. Each route sets a state, so a retry does no harm and
// the same route takes the change back.
export function deskStockRoutes(deps: StockDeps): Hono<AppEnv> {
  const { db, clock } = deps;
  const auth = deskAuth(deps);
  const setSoldOut = db.prepare(
    "UPDATE items SET sold_out = ? WHERE id = ? AND store_id = ?",
  );
  const setPaused = db.prepare("UPDATE stores SET paused = ? WHERE id = ?");
  const closeDay = db.prepare(
    "INSERT INTO closed_dates (store_id, date) VALUES (?, ?) ON CONFLICT DO NOTHING",
  );
  const openDay = db.prepare(
    "DELETE FROM closed_dates WHERE store_id = ? AND date = ?",
  );

  return new Hono<AppEnv>()
    .put("/api/desk/items/:id/sold-out", auth, async (c) => {
      const { storeId } = c.get("desk");
      const { sold_out } = await readJson(c, soldOutBodySchema);
      const id = c.req.param("id");
      if (setSoldOut.run(sold_out ? 1 : 0, id, storeId).changes === 0) {
        throw appError(
          404,
          "not_found",
          "This item is not on your menu. Reload the desk.",
        );
      }
      const answer: SoldOutAnswer = { item_id: id, sold_out };
      return c.json(answer);
    })
    .put("/api/desk/paused", auth, async (c) => {
      const { storeId } = c.get("desk");
      const { paused } = await readJson(c, pausedSchema);
      setPaused.run(paused ? 1 : 0, storeId);
      const answer: Paused = { paused };
      return c.json(answer);
    })
    .put("/api/desk/closed-dates/:day", auth, async (c) => {
      const { storeId } = c.get("desk");
      const day = closableDay(c.req.param("day"), istDay(clock.now()));
      const { closed } = await readJson(c, closedDayBodySchema);
      if (closed) closeDay.run(storeId, day);
      else openDay.run(storeId, day);
      const answer: ClosedDayAnswer = { day, closed };
      return c.json(answer);
    });
}

export function closedDatesFrom(db: Db, storeId: string, from: Day): Day[] {
  return db
    .prepare(
      "SELECT date FROM closed_dates WHERE store_id = ? AND date >= ? ORDER BY date",
    )
    .pluck()
    .all(storeId, from) as Day[];
}

const dayParamSchema = z.object({ day: daySchema });

function closableDay(value: string, today: Day): Day {
  const { day } = parseInput(dayParamSchema, { day: value });
  if (day < today) throw pastDayError();
  const last = addDays(today, closeAheadDays);
  if (day > last) throw farDayError(last);
  return day;
}
