import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loudnessOf,
  makeupGain,
  peakLimit,
  peakOf,
  renderSound,
  roomImpulse,
  tierGain,
  trimTail,
} from "./render.ts";
import { cues, roles, tierDb } from "./sounds.ts";

const sr = 48_000;

test("the loudness ladder: the more often a sound plays, the quieter its tier", () => {
  assert.deepEqual(tierDb, { 1: -32, 2: -27, 3: -23, 4: -20 });
  for (const role of ["tick", "step", "pick", "cascade", "unsure"] as const) {
    assert.equal(roles[role].tier, 1, role);
  }
  for (const role of ["arrival", "saved", "placed"] as const) {
    assert.equal(roles[role].tier, 4, role);
  }
});

test("a sound names its tier, and the render brings it there", () => {
  const sound = renderSound(cues.stamp("ready"), sr);
  assert.equal(sound.target, tierDb[roles.stamp.tier]);
  assert.ok(Math.abs(loudnessOf(sound.data, sr) - sound.target) < 0.01);
});

test("the tier gain moves the measured loudness onto the tier", () => {
  const { gain, peakLimited } = tierGain(-20, 0.1, -27);
  assert.ok(Math.abs(20 * Math.log10(gain) + 7) < 1e-9);
  assert.equal(peakLimited, false);
});

test("the peak limit holds every peak at −3 dBFS before the limiter", () => {
  const { gain, peakLimited } = tierGain(-40, 0.5, -20);
  assert.equal(peakLimited, true);
  assert.ok(Math.abs(0.5 * gain - peakLimit) < 1e-12);
  assert.deepEqual(tierGain(-Infinity, 0, -20), {
    gain: 1,
    peakLimited: false,
  });
});

test("the meter reads level in dB, over the loudest 100 ms, through the phone high-pass", () => {
  const quiet = loudnessOf(tone(1000, 0.1, 0.3), sr);
  const loud = loudnessOf(tone(1000, 0.2, 0.3), sr);
  assert.ok(Math.abs(loud - quiet - 20 * Math.log10(2)) < 0.01);
  const burst = new Float32Array(sr);
  burst.set(tone(1000, 0.2, 0.1), sr / 2);
  assert.ok(
    Math.abs(loudnessOf(burst, sr) - loudnessOf(tone(1000, 0.2, 0.1), sr)) <
      0.2,
  );
  assert.ok(loudnessOf(tone(150, 0.2, 0.3), sr) < loud - 10);
  assert.equal(loudnessOf(new Float32Array(100), sr), -Infinity);
});

test("the tail is cut 60 dB under the peak, and it fades to silence", () => {
  const decay = new Float32Array(sr);
  for (let i = 0; i < decay.length; i++) decay[i] = Math.exp(-i / 4800);
  const trimmed = trimTail(decay, sr);
  const cut = Math.round(4800 * Math.log(1000));
  assert.ok(Math.abs(trimmed.length - (cut + 480)) <= 2);
  assert.equal(trimmed.at(-1), 0);
  assert.equal(peakOf(trimmed), 1);
});

test("the room is stereo, 0.6 s long, silent for 5 ms, and its highs die first", () => {
  const [left, right] = roomImpulse(sr);
  assert.equal(left.length, 0.6 * sr);
  assert.notDeepEqual(left, right);
  assert.equal(peakOf(left.subarray(0, 0.005 * sr)), 0);
  const energy = (data: Float32Array) =>
    data.reduce((sum, x) => sum + x * x, 0);
  assert.ok(
    energy(left.subarray(0.3 * sr)) < energy(left.subarray(0, 0.3 * sr)) / 10,
  );
});

test("the master trim removes the make-up gain of the limiter", () => {
  assert.ok(Math.abs(makeupGain(-6, 20) - 1.4825) < 0.001);
  assert.equal(makeupGain(0, 20), 1);
});

function tone(f: number, amplitude: number, seconds: number): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * sr) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * f * i) / sr),
  );
}
