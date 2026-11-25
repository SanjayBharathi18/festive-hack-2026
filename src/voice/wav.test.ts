import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeWav, readWavFormat, wavSeconds } from "./wav.ts";

test("encodeWav writes a 16-bit mono PCM header", () => {
  const bytes = encodeWav(new Float32Array(16_000), 16_000);
  const view = new DataView(bytes.buffer);
  assert.equal(bytes.byteLength, 44 + 32_000);
  assert.equal(ascii(bytes, 0), "RIFF");
  assert.equal(view.getUint32(4, true), 36 + 32_000);
  assert.equal(ascii(bytes, 8), "WAVE");
  assert.equal(ascii(bytes, 12), "fmt ");
  assert.equal(view.getUint32(16, true), 16);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint32(28, true), 32_000);
  assert.equal(view.getUint16(32, true), 2);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(ascii(bytes, 36), "data");
  assert.equal(view.getUint32(40, true), 32_000);
});

test("samples are scaled to 16 bits and clamped", () => {
  const bytes = encodeWav(
    Float32Array.of(0, 1, -1, 0.5, -0.5, 1.5, -2, Number.NaN),
    16_000,
  );
  const samples = new Int16Array(bytes.buffer.slice(44));
  assert.deepEqual(
    [...samples],
    [0, 32_767, -32_768, 16_384, -16_384, 32_767, -32_768, 0],
  );
});

test("readWavFormat reads the format and the data size", () => {
  const bytes = encodeWav(new Float32Array(800), 16_000);
  assert.deepEqual(readWavFormat(bytes.buffer), {
    format: 1,
    channels: 1,
    sampleRate: 16_000,
    byteRate: 32_000,
    bitsPerSample: 16,
    dataBytes: 1600,
  });
});

test("wavSeconds reads the length from the header, without decoding", () => {
  assert.equal(
    wavSeconds(encodeWav(new Float32Array(8000 * 3), 8000).buffer),
    3,
  );
  const adpcm = encodeWav(new Float32Array(4000), 8000);
  new DataView(adpcm.buffer).setUint16(20, 17, true);
  new DataView(adpcm.buffer).setUint32(28, 4000, true);
  assert.equal(wavSeconds(adpcm.buffer), 2);
  assert.equal(wavSeconds(new ArrayBuffer(10)), undefined);
});

test("readWavFormat skips other chunks, with their padding byte", () => {
  const plain = encodeWav(new Float32Array(10), 8000);
  const list = Uint8Array.of(
    ...[..."LIST"].map((c) => c.charCodeAt(0)),
    3,
    0,
    0,
    0,
    1,
    2,
    3,
    0,
  );
  const bytes = new Uint8Array(plain.byteLength + list.byteLength);
  bytes.set(plain.subarray(0, 36));
  bytes.set(list, 36);
  bytes.set(plain.subarray(36), 36 + list.byteLength);
  assert.equal(readWavFormat(bytes.buffer)?.dataBytes, 20);
  assert.equal(readWavFormat(bytes.buffer)?.sampleRate, 8000);
});

test("readWavFormat refuses other files and cut-off data", () => {
  assert.equal(
    readWavFormat(new TextEncoder().encode("OggS".padEnd(64, "x")).buffer),
    undefined,
  );
  assert.equal(readWavFormat(new ArrayBuffer(10)), undefined);
  const bytes = encodeWav(new Float32Array(100), 16_000);
  assert.equal(readWavFormat(bytes.buffer.slice(0, 100)), undefined);
});

function ascii(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}
