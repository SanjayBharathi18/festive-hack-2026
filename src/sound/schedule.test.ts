import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arrivalRings,
  fire,
  heroOffsetMs,
  levelVariationDb,
  openThrottle,
  repeatDb,
  seedOrder,
  separationDelay,
  stepGapMs,
  throttle,
  voiceToStop,
} from "./schedule.ts";

type Played = { quantity: number; at: number; askedAt: number };

test("fast steps skip notes, the last quantity always plays, and the queue stays close behind the hand", () => {
  const played = simulateSteps([0, 10, 20, 30, 100, 105, 300]);
  assert.deepEqual(
    played.map(({ quantity, at }) => [quantity, at]),
    [
      [1, 0],
      [4, 60],
      [6, 120],
      [7, 300],
    ],
  );
  for (let i = 1; i < played.length; i++) {
    assert.ok(played[i]!.at - played[i - 1]!.at >= stepGapMs);
  }
  for (const note of played) assert.ok(note.at - note.askedAt <= 160);
});

test("steps at the hold repeat rate play every note", () => {
  const times = Array.from({ length: 6 }, (_, i) => i * 100);
  assert.equal(simulateSteps(times).length, times.length);
});

test("fast repeats of a role get quieter, 2 dB at a time to −6 dB, and a pause resets them", () => {
  let db = repeatDb(0, undefined);
  const levels = [db];
  for (const since of [100, 100, 100, 100]) {
    db = repeatDb(db, since);
    levels.push(db);
  }
  assert.deepEqual(levels, [0, -2, -4, -6, -6]);
  assert.equal(repeatDb(-6, 250), 0);
});

test("separate sounds start 100 ms apart, never more than 160 ms behind", () => {
  assert.equal(separationDelay(undefined, 50), 0);
  assert.equal(separationDelay(0, 30), 70);
  assert.equal(separationDelay(0, 150), 0);
  assert.equal(separationDelay(300, 0), 160);
});

test("one bell for each burst: another order within 10 s has no bell", () => {
  assert.equal(arrivalRings(undefined, 0), true);
  assert.equal(arrivalRings(0, 9_999), false);
  assert.equal(arrivalRings(0, 10_000), true);
});

test("a reply within 300 ms plays the saved hero from that far in", () => {
  assert.equal(heroOffsetMs(1_000, 1_100), 100);
  assert.equal(heroOffsetMs(1_000, 1_300), 0);
  assert.equal(heroOffsetMs(1_000, 1_500), 0);
  assert.equal(heroOffsetMs(1_000, 900), 0);
});

test("over 24 voices, a new voice takes the place of the oldest voice of the same role", () => {
  const playing = Array.from({ length: 24 }, (_, i) =>
    i === 5 ? "step" : "tick",
  );
  assert.equal(voiceToStop(playing, "step"), -1);
  assert.equal(voiceToStop([...playing, "step"], "step"), 5);
  assert.equal(voiceToStop([...playing, "saved"], "saved"), 0);
});

test("the renders of a frequent sound play in turn", () => {
  assert.deepEqual(seedOrder(undefined, 3), [0, 1, 2]);
  assert.deepEqual(seedOrder(0, 3), [1, 2, 0]);
  assert.deepEqual(seedOrder(2, 3), [0, 1, 2]);
  assert.deepEqual(seedOrder(0, 1), [0]);
});

test("the level of each play varies within ±1 dB", () => {
  assert.equal(levelVariationDb(0), -1);
  assert.equal(levelVariationDb(0.5), 0);
  assert.ok(levelVariationDb(0.999) < 1);
});

function simulateSteps(times: readonly number[]): Played[] {
  const played: Played[] = [];
  let state = openThrottle;
  let waiting: Omit<Played, "at"> | undefined;
  const flush = (until: number) => {
    if (state.dueAt === undefined || state.dueAt > until || !waiting) return;
    played.push({ ...waiting, at: state.dueAt });
    state = fire(state.dueAt);
    waiting = undefined;
  };
  times.forEach((now, index) => {
    flush(now);
    const next = throttle(state, now);
    state = next.state;
    const note = { quantity: index + 1, askedAt: now };
    if (next.play === "now") played.push({ ...note, at: now });
    else waiting = note;
  });
  flush(Infinity);
  return played;
}
