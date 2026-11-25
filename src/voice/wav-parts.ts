import { maxPartBytes } from "../../shared/reading.ts";
import {
  cutFrameSamples,
  lengthProblem,
  maxPartSamples,
  minSeconds,
  partSeconds,
  sourceMinutes,
  sourceSeconds,
  wavRate,
} from "./limits.ts";
import { cutParts } from "./parts.ts";
import { voiceError } from "./voice-error.ts";
import { encodeWav, readWavFormat, wavBytesPerSample } from "./wav.ts";

export type WavParts = {
  parts: Uint8Array<ArrayBuffer>[];
  seconds: number;
};

export function toWavParts(
  channels: readonly Float32Array[],
  sampleRate: number,
): WavParts {
  if (Math.round(sampleRate) !== wavRate) {
    throw new Error(`Decode the audio at ${wavRate} Hz, not ${sampleRate} Hz.`);
  }
  const length = channels[0]?.length ?? 0;
  const problem = lengthProblem(length / wavRate);
  if (problem !== undefined) {
    throw voiceError(problem, { minutes: sourceMinutes });
  }
  const kept = Math.min(length, sourceSeconds * wavRate);
  const mono = downmix(channels.map((channel) => channel.subarray(0, kept)));
  return {
    parts: cutParts(mono, maxPartSamples, cutFrameSamples).map((part) =>
      encodeWav(part, wavRate),
    ),
    seconds: kept / wavRate,
  };
}

// A file that is already one valid part goes as it is, byte for byte, so a
// fixture WAV finds its recorded answer by its SHA-256.
export function secondsAsOnePart(bytes: ArrayBuffer): number | undefined {
  const format = readWavFormat(bytes);
  if (
    format === undefined ||
    format.format !== 1 ||
    format.channels !== 1 ||
    format.sampleRate !== wavRate ||
    format.bitsPerSample !== 8 * wavBytesPerSample ||
    bytes.byteLength > maxPartBytes
  ) {
    return undefined;
  }
  const seconds = format.dataBytes / (wavRate * wavBytesPerSample);
  return seconds >= minSeconds && seconds <= partSeconds ? seconds : undefined;
}

export function downmix(channels: readonly Float32Array[]): Float32Array {
  const [first] = channels;
  if (first === undefined) return new Float32Array(0);
  if (channels.length === 1) return first;
  const mono = new Float32Array(first.length);
  for (const channel of channels) {
    for (let index = 0; index < mono.length; index++) {
      mono[index]! += channel[index] ?? 0;
    }
  }
  const scale = 1 / channels.length;
  for (let index = 0; index < mono.length; index++) mono[index]! *= scale;
  return mono;
}
