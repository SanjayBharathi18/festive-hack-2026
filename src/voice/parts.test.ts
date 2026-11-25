import assert from "node:assert/strict";
import { test } from "node:test";
import { cutParts } from "./parts.ts";

test("an input that fits is one part", () => {
  const samples = noise(1000);
  assert.deepEqual(cutParts(samples, 1000, 20), [samples]);
});

test("the parts are the fewest, each at the limit or less, and cover the input in order", () => {
  const samples = noise(100_000);
  const parts = cutParts(samples, 29_000, 320);
  assert.equal(parts.length, 4);
  for (const part of parts) assert.ok(part.length <= 29_000);
  assert.deepEqual(join(parts), samples);
});

test("a cut moves to the quietest place near an even split", () => {
  const samples = noise(40_000);
  samples.fill(0, 21_000, 21_400);
  const [first, second] = cutParts(samples, 29_000, 160);
  assert.ok(first && second);
  assert.ok(
    first.length >= 21_000 && first.length <= 21_400,
    `cut at ${first.length}`,
  );
  assert.equal(first.length + second.length, 40_000);
});

test("a cut stays at the even split when there is no room to move", () => {
  const samples = noise(58_000);
  samples.fill(0, 10_000, 10_500);
  const parts = cutParts(samples, 29_000, 160);
  assert.deepEqual(
    parts.map((part) => part.length),
    [29_000, 29_000],
  );
});

function noise(length: number): Float32Array {
  const samples = new Float32Array(length);
  let seed = 7;
  for (let index = 0; index < length; index++) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    samples[index] = (seed / 2_147_483_648) * 0.6 - 0.3;
  }
  return samples;
}

function join(parts: Float32Array[]): Float32Array {
  const joined = new Float32Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}
