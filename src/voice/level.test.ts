import assert from "node:assert/strict";
import { test } from "node:test";
import { levelOf, smoothLevel } from "./level.ts";

test("silence is 0 and a full-scale square wave is 1", () => {
  assert.equal(levelOf(new Float32Array(512)), 0);
  assert.equal(levelOf(new Float32Array(0)), 0);
  assert.equal(
    levelOf(Float32Array.from({ length: 512 }, (_, i) => (i % 2 ? 1 : -1))),
    1,
  );
});

test("the level is linear in decibels from -60 dB to 0 dB", () => {
  assert.equal(levelOf(new Float32Array(512).fill(0.0001)), 0);
  assert.ok(
    Math.abs(levelOf(new Float32Array(512).fill(10 ** (-30 / 20))) - 0.5) <
      1e-6,
  );
  assert.ok(
    Math.abs(levelOf(new Float32Array(512).fill(10 ** (-6 / 20))) - 0.9) < 1e-6,
  );
});

test("smoothLevel rises at once and falls slowly", () => {
  assert.equal(smoothLevel(0.2, 0.8), 0.8);
  const falling = smoothLevel(0.8, 0);
  assert.ok(falling < 0.8 && falling > 0.5);
});
