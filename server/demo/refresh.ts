import { addDays, istDay } from "../../shared/day.ts";
import type { Clock } from "../clock.ts";
import type { Db } from "../db/database.ts";
import type { Log } from "../log.ts";
import { seedDemo } from "./seed.ts";

export type DemoRefreshDeps = {
  db: Db;
  clock: Clock;
  log: Log;
  stopping: AbortSignal;
};

export function startDemoRefresh({
  db,
  clock,
  log,
  stopping,
}: DemoRefreshDeps): void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function refresh(): void {
    try {
      const { day, storeIds } = seedDemo(db, clock);
      log({
        msg: "demo seed refreshed",
        day,
        stores: Object.keys(storeIds).length,
      });
    } catch (error) {
      log({ msg: "the demo seed failed", error: String(error) });
    }
  }

  function schedule(): void {
    if (stopping.aborted) return;
    timer = setTimeout(() => {
      refresh();
      schedule();
    }, msUntilIstMidnight(clock.now()));
    timer.unref();
  }

  stopping.addEventListener("abort", () => clearTimeout(timer), { once: true });
  refresh();
  schedule();
}

export function msUntilIstMidnight(now: number): number {
  return Date.parse(`${addDays(istDay(now), 1)}T00:00:00+05:30`) - now;
}
