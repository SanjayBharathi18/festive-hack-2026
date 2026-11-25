import { maxPartBytes } from "../../shared/reading.ts";
import { wavBytesPerSample, wavHeaderBytes } from "./wav.ts";
import type { VoiceErrorCode } from "./voice-error.ts";

export const wavRate = 16_000;
export const partSeconds = 29;
export const sourceSeconds = 5 * 60;
export const sourceMinutes = sourceSeconds / 60;
export const minSeconds = 0.5;
// A recording stops at the limit, and its decoded length can run a little over.
export const graceSeconds = 1;
// 5 minutes of CD-quality stereo WAV is 53 MB. A bigger file is refused before
// the phone spends its memory on decoding it.
export const maxFileBytes = 64 * 1024 * 1024;
export const cutFrameSamples = wavRate / 50;

export const maxPartSamples = Math.min(
  partSeconds * wavRate,
  Math.floor((maxPartBytes - wavHeaderBytes) / wavBytesPerSample),
);

export function lengthProblem(
  seconds: number,
): Extract<VoiceErrorCode, "too_long" | "too_short"> | undefined {
  if (seconds < minSeconds) return "too_short";
  if (seconds > sourceSeconds + graceSeconds) return "too_long";
  return undefined;
}
