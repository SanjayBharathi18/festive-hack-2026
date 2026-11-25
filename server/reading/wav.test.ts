import assert from "node:assert/strict";
import { test } from "node:test";
import { wavBytes } from "./test-wav.ts";
import { readWav } from "./wav.ts";

test("a 16 kHz mono WAV gives its length in seconds", () => {
  assert.deepEqual(readWav(wavBytes(2.5)), {
    seconds: 2.5,
    sampleRate: 16_000,
    channels: 1,
    bitsPerSample: 16,
  });
});

test("stereo and other rates use the byte rate of the header", () => {
  const wav = readWav(wavBytes(1, { rate: 44_100, channels: 2 }));
  assert.equal(wav?.seconds, 1);
  assert.equal(wav?.channels, 2);
});

test("a chunk before fmt is skipped, with its padding byte", () => {
  const plain = wavBytes(1);
  const extra = new Uint8Array([
    ...new TextEncoder().encode("LIST"),
    3,
    0,
    0,
    0,
    1,
    2,
    3,
    0,
  ]);
  const bytes = new Uint8Array(plain.length + extra.length);
  bytes.set(plain.subarray(0, 12));
  bytes.set(extra, 12);
  bytes.set(plain.subarray(12), 12 + extra.length);
  assert.equal(readWav(bytes)?.seconds, 1);
});

test("a data size larger than the file counts only the bytes that came", () => {
  const bytes = wavBytes(1);
  new DataView(bytes.buffer).setUint32(40, 0xffffffff, true);
  assert.equal(readWav(bytes)?.seconds, 1);
});

test("a file that is not a WAV is refused", () => {
  assert.equal(readWav(new Uint8Array(0)), undefined);
  assert.equal(
    readWav(new TextEncoder().encode("OggS not a wave file")),
    undefined,
  );
  const noWave = wavBytes(1);
  noWave.set(new TextEncoder().encode("AVI "), 8);
  assert.equal(readWav(noWave), undefined);
});

test("a WAV with no format, an unknown format or no byte rate is refused", () => {
  const noFormat = wavBytes(1);
  noFormat.set(new TextEncoder().encode("junk"), 12);
  assert.equal(readWav(noFormat), undefined);
  assert.equal(readWav(wavBytes(1, { format: 85 })), undefined);
  const noRate = wavBytes(1);
  new DataView(noRate.buffer).setUint32(28, 0, true);
  assert.equal(readWav(noRate), undefined);
});

test("a WAV with no data chunk is refused", () => {
  assert.equal(readWav(wavBytes(1).subarray(0, 36)), undefined);
});

test("the length comes from the rate, channels and sample size, not from the byte rate", () => {
  assert.equal(readWav(wavBytes(2, { rate: 8_000, bits: 8 }))?.seconds, 2);
  assert.equal(readWav(wavBytes(1, { rate: 44_100, channels: 2 }))?.seconds, 1);
});

test("a header whose byte rate or block size disagree with the format is refused", () => {
  const lyingRate = wavBytes(31);
  new DataView(lyingRate.buffer).setUint32(28, 320_000, true);
  assert.equal(readWav(lyingRate), undefined);
  const lyingBlock = wavBytes(1);
  new DataView(lyingBlock.buffer).setUint16(32, 4, true);
  assert.equal(readWav(lyingBlock), undefined);
  const oddBits = wavBytes(1);
  new DataView(oddBits.buffer).setUint16(34, 12, true);
  assert.equal(readWav(oddBits), undefined);
});
