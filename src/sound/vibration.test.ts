import assert from "node:assert/strict";
import { test } from "node:test";
import { cues } from "./sounds.ts";
import { buzzes, createVibration, isAndroid, patternFor } from "./vibration.ts";

const android =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const laptop =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

test("the buzz count matches the sound", () => {
  assert.deepEqual(patternFor(cues.record("start")), [15]);
  assert.deepEqual(patternFor(cues.record("stop")), [15]);
  assert.deepEqual(patternFor(cues.saved()), [20, 40, 20, 40, 20]);
  assert.deepEqual(patternFor(cues.arrival()), [40, 40, 40]);
  assert.deepEqual(patternFor(cues.arrival("quote")), [40]);
  for (const cue of [
    cues.tick(),
    cues.stamp("paid"),
    cues.placed(),
    cues.error(),
  ]) {
    assert.equal(patternFor(cue), undefined);
  }
  assert.deepEqual(buzzes(3, 20, 60), [20, 40, 20, 40, 20]);
});

test("only Android phones vibrate", () => {
  assert.equal(isAndroid(android), true);
  assert.equal(isAndroid(iphone), false);
  assert.equal(isAndroid(laptop), false);
  const calls: number[][] = [];
  const vibrate = (pattern: number[]) => {
    calls.push(pattern);
    return true;
  };
  createVibration({ userAgent: laptop, vibrate }).buzz([15]);
  createVibration({ userAgent: android, vibrate: undefined }).buzz([15]);
  assert.deepEqual(calls, []);
  createVibration({ userAgent: android, vibrate }).buzz([40, 40, 40]);
  assert.deepEqual(calls, [[40, 40, 40]]);
});
