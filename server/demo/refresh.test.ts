import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../db/database.ts";
import { createLog } from "../log.ts";
import { createTestClock } from "../test-app.ts";
import { msUntilIstMidnight, startDemoRefresh } from "./refresh.ts";
import { heroSlug, stableId } from "./seed.ts";

const minute = 60 * 1000;
const day = 24 * 60 * minute;

function start(now: number) {
  const db = openDatabase(":memory:");
  const clock = createTestClock(now);
  const lines: string[] = [];
  const stopping = new AbortController();
  startDemoRefresh({
    db,
    clock,
    log: createLog((line) => lines.push(line), clock),
    stopping: stopping.signal,
  });
  const refreshes = () =>
    lines
      .map((line) => JSON.parse(line) as { msg: string; day?: string })
      .filter(({ msg }) => msg === "demo seed refreshed")
      .map(({ day }) => day);
  return { db, clock, stopping, refreshes };
}

test("msUntilIstMidnight counts to the next 00:00 in India", () => {
  assert.equal(msUntilIstMidnight(Date.parse("2026-11-24T18:29:00Z")), minute);
  assert.equal(msUntilIstMidnight(Date.parse("2026-11-24T18:30:00Z")), day);
  assert.equal(
    msUntilIstMidnight(Date.parse("2026-11-24T06:30:00Z")),
    12 * 60 * minute,
  );
});

test("the seed runs at start and again at each 00:00 IST", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { db, clock, stopping, refreshes } = start(
    Date.parse("2026-11-24T18:00:00Z"),
  );
  assert.deepEqual(refreshes(), ["2026-11-24"]);
  const heroId = stableId("store", heroSlug);
  db.prepare("UPDATE stores SET paused = 1 WHERE id = ?").run(heroId);

  const toMidnight = 30 * minute;
  clock.advance(toMidnight - 1);
  t.mock.timers.tick(toMidnight - 1);
  assert.deepEqual(refreshes(), ["2026-11-24"]);

  clock.advance(1);
  t.mock.timers.tick(1);
  assert.deepEqual(refreshes(), ["2026-11-24", "2026-11-25"]);
  assert.equal(
    db.prepare("SELECT paused FROM stores WHERE id = ?").pluck().get(heroId),
    0,
  );

  clock.advance(day);
  t.mock.timers.tick(day);
  assert.deepEqual(refreshes(), ["2026-11-24", "2026-11-25", "2026-11-26"]);
  stopping.abort();
});

test("the timer stops when the server stops", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { clock, stopping, refreshes } = start(
    Date.parse("2026-11-24T18:00:00Z"),
  );
  stopping.abort();
  clock.advance(2 * day);
  t.mock.timers.tick(2 * day);
  assert.deepEqual(refreshes(), ["2026-11-24"]);
});

test("a failed seed is logged, and the server goes on", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const db = openDatabase(":memory:");
  db.close();
  const clock = createTestClock();
  const lines: string[] = [];
  const stopping = new AbortController();
  assert.doesNotThrow(() =>
    startDemoRefresh({
      db,
      clock,
      log: createLog((line) => lines.push(line), clock),
      stopping: stopping.signal,
    }),
  );
  const [line] = lines.map((entry) => JSON.parse(entry) as { msg: string });
  assert.equal(line?.msg, "the demo seed failed");
  stopping.abort();
});
