import assert from "node:assert/strict";
import { test } from "node:test";
import { createMetrics, type Metrics } from "../metrics/metrics.ts";
import { createTestClock } from "../test-app.ts";
import {
  alertRule,
  alertState,
  createReadingWindow,
  pruneSnapshots,
  readingCounts,
  windowIncrease,
  wouldFire,
  type Snapshot,
} from "./reading-window.ts";

function read(metrics: Metrics, language: string, outcome: string, times = 1) {
  for (let index = 0; index < times; index += 1) {
    metrics.readingResults.inc({
      language,
      variant: "native",
      path: "ai",
      outcome,
    });
  }
}

const snapshot = (at: number, readings: number, invalid: number): Snapshot => ({
  at,
  counts: new Map([["kn-IN", { readings, invalid }]]),
});

test("the condition is more than 30% invalid, with 5 readings or more", () => {
  assert.equal(wouldFire({ readings: 5, invalid: 2 }), true);
  assert.equal(wouldFire({ readings: 10, invalid: 3 }), false);
  assert.equal(wouldFire({ readings: 4, invalid: 4 }), false);
  assert.equal(wouldFire({ readings: 0, invalid: 0 }), false);
  assert.equal(wouldFire({ readings: 17, invalid: 5 }), false);
  assert.equal(wouldFire({ readings: 16, invalid: 5 }), true);
});

test("the alert is pending until the condition holds for 2 minutes", () => {
  assert.equal(alertState(false, 0), "inactive");
  assert.equal(alertState(true, 0), "pending");
  assert.equal(alertState(true, alertRule.holdMs - 1), "pending");
  assert.equal(alertState(true, alertRule.holdMs), "firing");
});

test("readingCounts sums the counter by language", async () => {
  const metrics = createMetrics();
  read(metrics, "kn-IN", "invalid", 2);
  read(metrics, "kn-IN", "ok");
  read(metrics, "hi-IN", "timeout");
  metrics.readingResults.inc({
    language: "kn-IN",
    variant: "translate_first",
    path: "ai",
    outcome: "invalid",
  });
  const counts = await readingCounts(metrics);
  assert.deepEqual(counts.get("kn-IN"), { readings: 4, invalid: 3 });
  assert.deepEqual(counts.get("hi-IN"), { readings: 1, invalid: 0 });
});

test("the increase starts at the newest sample at least 2 minutes old", () => {
  const minute = 60_000;
  const samples = [
    snapshot(0, 2, 0),
    snapshot(1 * minute, 4, 1),
    snapshot(2 * minute, 9, 4),
    snapshot(3 * minute, 14, 9),
  ];
  assert.deepEqual(
    windowIncrease(samples, 3 * minute, 2 * minute).get("kn-IN"),
    {
      readings: 10,
      invalid: 8,
    },
  );
  assert.deepEqual(
    windowIncrease(samples.slice(2), 3 * minute, 2 * minute).get("kn-IN"),
    { readings: 5, invalid: 5 },
  );
  assert.equal(windowIncrease([], 0, 2 * minute).size, 0);
});

test("pruning keeps the start of the window", () => {
  const samples = [snapshot(0, 0, 0), snapshot(10, 1, 0), snapshot(20, 2, 0)];
  pruneSnapshots(samples, 15);
  assert.deepEqual(
    samples.map(({ at }) => at),
    [10, 20],
  );
  pruneSnapshots(samples, 5);
  assert.equal(samples.length, 2);
});

test("the window follows the readings, and the alert fires after its hold", async () => {
  const metrics = createMetrics();
  const clock = createTestClock();
  const window = createReadingWindow({ metrics, clock });
  await window.sample();
  assert.deepEqual(
    window.languages().map(({ language }) => language),
    ["kn-IN", "hi-IN", "en-IN"],
  );
  read(metrics, "kn-IN", "invalid", 5);
  read(metrics, "hi-IN", "ok", 5);
  read(metrics, "ta-IN", "ok");
  clock.advance(5_000);
  await window.sample();
  const kannada = () =>
    window.languages().find(({ language }) => language === "kn-IN");
  assert.deepEqual(kannada(), {
    language: "kn-IN",
    readings: 5,
    invalid: 5,
    invalid_rate: 1,
    would_fire: true,
    held_seconds: 0,
    state: "pending",
  });
  assert.equal(
    window.languages().find(({ language }) => language === "hi-IN")?.state,
    "inactive",
  );
  assert.ok(window.languages().some(({ language }) => language === "ta-IN"));
  clock.advance(alertRule.holdMs);
  read(metrics, "kn-IN", "invalid", 5);
  await window.sample();
  assert.equal(kannada()?.state, "firing");
  assert.equal(kannada()?.held_seconds, alertRule.holdMs / 1000);
  read(metrics, "kn-IN", "ok", 12);
  clock.advance(5_000);
  await window.sample();
  assert.equal(kannada()?.readings, 17);
  assert.equal(kannada()?.invalid, 5);
  assert.equal(kannada()?.state, "inactive");
  assert.equal(kannada()?.held_seconds, 0);
  clock.advance(alertRule.windowMs);
  await window.sample();
  assert.equal(kannada()?.readings, 0);
  assert.equal(kannada()?.invalid_rate, null);
});
