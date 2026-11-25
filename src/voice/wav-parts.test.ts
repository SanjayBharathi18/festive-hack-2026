import assert from "node:assert/strict";
import { test } from "node:test";
import { maxPartBytes } from "../../shared/reading.ts";
import { isVoiceError } from "./voice-error.ts";
import { encodeWav, readWavFormat } from "./wav.ts";
import { downmix, secondsAsOnePart, toWavParts } from "./wav-parts.ts";

test("70 s of 16 kHz stereo becomes three 16 kHz mono WAV parts", () => {
  const left = tone(440, 16_000, 70);
  const right = tone(660, 16_000, 70);
  const { parts, seconds } = toWavParts([left, right], 16_000);
  assert.equal(seconds, 70);
  assert.equal(parts.length, 3);
  let total = 0;
  for (const part of parts) {
    const format = readWavFormat(part.buffer);
    assert.equal(format?.sampleRate, 16_000);
    assert.equal(format?.channels, 1);
    assert.equal(format?.bitsPerSample, 16);
    assert.ok(part.byteLength <= maxPartBytes);
    assert.ok((format?.dataBytes ?? 0) / 32_000 <= 29);
    total += (format?.dataBytes ?? 0) / 2;
  }
  assert.equal(total, 70 * 16_000);
});

test("audio that was not decoded at 16 kHz is a mistake in the code", () => {
  assert.throws(
    () => toWavParts([new Float32Array(48_000)], 48_000),
    /16000 Hz/,
  );
});

test("16 kHz input keeps its samples", () => {
  const samples = Float32Array.from(
    { length: 16_000 },
    (_, i) => ((i % 200) - 100) / 128,
  );
  const [part] = toWavParts([samples], 16_000).parts;
  assert.deepEqual(part, encodeWav(samples, 16_000));
});

test("more than 5 minutes is refused, with the limit for the message", () => {
  assert.throws(
    () => toWavParts([new Float32Array(16_000 * 302)], 16_000),
    (error) =>
      isVoiceError(error) &&
      error.code === "too_long" &&
      error.params.minutes === 5,
  );
});

test("a recording that runs a little over the limit is cut at 5 minutes", () => {
  const { parts, seconds } = toWavParts(
    [new Float32Array(16_000 * 300.5)],
    16_000,
  );
  assert.equal(seconds, 300);
  assert.equal(parts.length, 11);
});

test("less than half a second is refused", () => {
  assert.throws(
    () => toWavParts([new Float32Array(4000)], 16_000),
    (error) => isVoiceError(error) && error.code === "too_short",
  );
});

test("downmix averages the channels", () => {
  assert.deepEqual(
    downmix([Float32Array.of(1, 0.5), Float32Array.of(0, -0.5)]),
    Float32Array.of(0.5, 0),
  );
  const mono = Float32Array.of(0.25);
  assert.equal(downmix([mono]), mono);
  assert.equal(downmix([]).length, 0);
});

test("a 16 kHz mono WAV of 29 s or less goes as one part, as it is", () => {
  assert.equal(
    secondsAsOnePart(encodeWav(new Float32Array(16_000 * 10), 16_000).buffer),
    10,
  );
  assert.equal(
    secondsAsOnePart(encodeWav(new Float32Array(48_000 * 2), 48_000).buffer),
    undefined,
  );
  assert.equal(
    secondsAsOnePart(encodeWav(new Float32Array(16_000 * 30), 16_000).buffer),
    undefined,
  );
  assert.equal(
    secondsAsOnePart(encodeWav(new Float32Array(1000), 16_000).buffer),
    undefined,
  );
  const stereo = encodeWav(new Float32Array(16_000 * 4), 16_000);
  new DataView(stereo.buffer).setUint16(22, 2, true);
  assert.equal(secondsAsOnePart(stereo.buffer), undefined);
  assert.equal(
    secondsAsOnePart(
      new TextEncoder().encode("not a wav file at all, no").buffer,
    ),
    undefined,
  );
});

function tone(hz: number, rate: number, seconds: number): Float32Array {
  const samples = new Float32Array(Math.round(rate * seconds));
  for (let index = 0; index < samples.length; index++) {
    samples[index] = 0.3 * Math.sin((2 * Math.PI * hz * index) / rate);
  }
  return samples;
}
