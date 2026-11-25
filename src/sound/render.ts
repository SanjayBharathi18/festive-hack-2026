import {
  ma,
  roles,
  swara,
  takes,
  tierDb,
  type Cue,
  type Draw,
  type Outcome,
  type RoleId,
  type Take,
} from "./sounds.ts";
import {
  cents,
  coefficients,
  filterInPlace,
  hash,
  random,
  silence,
} from "./synth.ts";

export type Prime = { readonly f: number; readonly foreign: boolean };
export type Rendered = {
  readonly data: Float32Array<ArrayBuffer>;
  readonly primes: readonly Prime[];
  readonly marks: readonly Outcome[];
  readonly target: number;
  readonly loudness: number;
  readonly peak: number;
  readonly peakLimited: boolean;
};
export type TierGain = { readonly gain: number; readonly peakLimited: boolean };

export const peakLimit = 10 ** (-3 / 20);
const maxDetuneCents = 3;
const bufferHighpassHz = 180;
const roomSeconds = 0.6;
const roomPreDelaySeconds = 0.005;

/** Renders one cue, measures it once and brings it to its tier. `seed` picks one of the small variations. */
export function renderSound(cue: Cue, sr: number, seed = 0): Rendered {
  const role = roles[cue.role];
  const rand = random(
    hash(`${cue.role}|${role.take}|${JSON.stringify(cue.params)}|${seed}`),
  );
  const detune = cents((rand() * 2 - 1) * maxDetuneCents);
  const primes: Prime[] = [];
  const marks: Outcome[] = [];
  const note = (f: number, foreign: boolean) => {
    primes.push({ f, foreign });
    return f;
  };
  const draw: Draw = {
    sr,
    rand,
    swara: (degree, octave = 0) => note(swara(degree, octave) * detune, false),
    ma: (octave = 0) => note(ma(octave) * detune, true),
    mark: (outcome) => {
      marks.push(outcome);
    },
  };
  const take: Take<RoleId> = takes[cue.role];
  const raw = silence(take.seconds, sr);
  take.draw(raw, draw, cue.params);
  // Modes that start together and decay fast leave a small offset.
  const highpass = coefficients("highpass", bufferHighpassHz, Math.SQRT1_2, sr);
  filterInPlace(raw, highpass);
  filterInPlace(raw, highpass);
  const data = trimTail(raw, sr);
  const measured = loudnessOf(data, sr);
  const peak = peakOf(data);
  const target = tierDb[role.tier];
  const { gain, peakLimited } = tierGain(measured, peak, target);
  for (let i = 0; i < data.length; i++) data[i]! *= gain;
  return {
    data,
    primes,
    marks,
    target,
    loudness: measured + 20 * Math.log10(gain),
    peak: peak * gain,
    peakLimited,
  };
}

/** One stereo room of 0.6 s: highs die faster than lows, after a 5 ms pre-delay. */
export function roomImpulse(
  sr: number,
): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const rand = random(7);
  const length = Math.round(roomSeconds * sr);
  const pre = Math.round(roomPreDelaySeconds * sr);
  const lowDecay = 6.91 / 0.45;
  const highDecay = 6.91 / 0.25;
  const channel = () => {
    const data = new Float32Array(length);
    let low = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sr;
      const white = rand() * 2 - 1;
      low += (white - low) * 0.25;
      data[i] =
        low * Math.exp(-lowDecay * t) +
        (white - low) * 0.5 * Math.exp(-highDecay * t);
    }
    return data;
  };
  return [channel(), channel()];
}

/** K-weighting (its high shelf), a 400 Hz high-pass for the phone, and the loudest 100 ms window. */
export function loudnessOf(data: Float32Array, sr: number): number {
  const weighted = Float32Array.from(data);
  filterInPlace(weighted, coefficients("highshelf", 1681, Math.SQRT1_2, sr, 4));
  filterInPlace(weighted, coefficients("highpass", 400, Math.SQRT1_2, sr));
  const window = Math.round(0.1 * sr);
  let sum = 0;
  let loudest = 0;
  for (let i = 0; i < weighted.length; i++) {
    sum += weighted[i]! ** 2;
    if (i >= window) sum -= weighted[i - window]! ** 2;
    loudest = Math.max(loudest, sum / window);
  }
  return loudest > 0 ? -0.691 + 10 * Math.log10(loudest) : -Infinity;
}

/** The gain that brings a sound to its tier, held back so that no peak passes −3 dBFS. */
export function tierGain(
  measuredDb: number,
  peak: number,
  targetDb: number,
): TierGain {
  if (!Number.isFinite(measuredDb) || peak <= 0) {
    return { gain: 1, peakLimited: false };
  }
  const gain = 10 ** ((targetDb - measuredDb) / 20);
  return peak * gain > peakLimit
    ? { gain: peakLimit / peak, peakLimited: true }
    : { gain, peakLimited: false };
}

/** Cuts the tail where it falls 60 dB under the peak, with a 10 ms fade. */
export function trimTail(
  data: Float32Array,
  sr: number,
): Float32Array<ArrayBuffer> {
  const peak = peakOf(data);
  let last = data.length - 1;
  while (last > 0 && Math.abs(data[last]!) < peak * 1e-3) last--;
  const end = Math.min(data.length, last + Math.round(0.01 * sr));
  const trimmed = data.slice(0, Math.max(1, end));
  const fade = Math.min(trimmed.length, Math.round(0.01 * sr));
  for (let i = 0; i < fade; i++) trimmed[trimmed.length - 1 - i]! *= i / fade;
  return trimmed;
}

export function peakOf(data: Float32Array): number {
  let peak = 0;
  for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

/** The make-up gain that a DynamicsCompressorNode adds by itself; the master trim removes it. */
export function makeupGain(thresholdDb: number, ratio: number): number {
  const fullRangeDb = thresholdDb + (0 - thresholdDb) / ratio;
  return (1 / 10 ** (fullRangeDb / 20)) ** 0.6;
}
