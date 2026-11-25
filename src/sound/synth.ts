export type Rand = () => number;
export type Material = "steelBowl" | "steelPlate" | "glass" | "wood" | "clay";
export type Stroke = "na" | "tin" | "te";
export type Hand = "free" | "held" | "closed";
export type Bend = {
  readonly from: number;
  readonly to: number;
  readonly delay: number;
  readonly time: number;
};
export type ImpactOptions = {
  readonly force?: number;
  readonly hand?: Hand | number;
  readonly ring?: number;
  readonly click?: boolean;
};
export type ContactLayer = {
  readonly at: number;
  readonly ratio: number;
  readonly q: number;
  readonly db: number;
  readonly fall: number;
  readonly rise: number;
  readonly riseDb?: number;
};
export type Contact = {
  readonly layers: readonly ContactLayer[];
  readonly exciter?: { readonly at: number; readonly db: number };
};
export type FilterType = "bandpass" | "highpass" | "highshelf";
export type Biquad = readonly [number, number, number, number, number];

type Modes = {
  readonly ratios: readonly number[];
  readonly gains: readonly number[];
  readonly tanPhi: number;
  readonly contact: number;
  readonly doublet?: number;
};
type Curve = {
  readonly values: Float64Array;
  readonly steady: number;
  readonly settled: number;
};
type BurstOptions = {
  readonly f: number;
  readonly q?: number;
  readonly length: number;
  readonly level?: number;
  readonly attack?: number;
  readonly attackDb?: number;
};
type CrackleOptions = {
  readonly length: number;
  readonly rateFrom: number;
  readonly rateTo?: number;
  readonly band: readonly [number, number];
  readonly fall?: boolean;
};

const tau = Math.PI * 2;
// The decay that takes a mode down 80 dB, and the T60 constant of the damping law.
const fall80 = Math.log(1e4);
const t60 = 6.91;
const materials: Readonly<Record<Material, Modes>> = {
  steelBowl: {
    ratios: [1, 2.83, 5.42, 8.77, 12.9],
    gains: [1, 0.5, 0.3, 0.15, 0.08],
    tanPhi: 0.001,
    doublet: 2,
    contact: 0.00015,
  },
  steelPlate: {
    ratios: [1, 1.73, 2.33, 3.91, 4.11],
    gains: [1, 0.6, 0.45, 0.25, 0.2],
    tanPhi: 0.001,
    contact: 0.0005,
  },
  glass: {
    ratios: [1, 2.83, 5.42],
    gains: [1, 0.45, 0.2],
    tanPhi: 0.002,
    doublet: 1.5,
    contact: 0.00008,
  },
  wood: {
    ratios: [1, 2.78, 5.44, 9],
    gains: [1, 0.5, 0.25, 0.12],
    tanPhi: 0.06,
    contact: 0.0015,
  },
  clay: {
    ratios: [1, 2.6, 4.9],
    gains: [1, 0.4, 0.15],
    tanPhi: 0.035,
    contact: 0.002,
  },
};
const hands: Readonly<Record<Hand, number>> = {
  free: 0,
  held: 20,
  closed: 180,
};
const strokes: Readonly<
  Record<Stroke, { gains: readonly number[]; t80: readonly number[] }>
> = {
  na: { gains: [0.08, 1, 0.6, 0.4, 0.25], t80: [0.08, 0.5, 0.4, 0.3, 0.25] },
  tin: { gains: [0.1, 1, 0.4, 0.15, 0.08], t80: [0.1, 0.9, 0.6, 0.4, 0.3] },
  te: {
    gains: [0.15, 0.6, 0.5, 0.35, 0.25],
    t80: [0.05, 0.05, 0.05, 0.05, 0.05],
  },
};
const dayanDetune = [1, 1.002, 0.998, 1.003, 0.997];
const bayanDetune = [1, 1.004, 0.997, 1.006];
const bayanGains = [0.3, 1, 0.6, 0.3];
const bellModes = [
  [1, 1],
  [2.83, 0.4],
  [5.42, 0.15],
] as const;

/**
 * A dayan stroke: harmonics 1 to 5 of a skin whose pitch starts 1.5% sharp. `hand` adds the
 * damping of a hand that stops the skin (d_hand, per second) to each harmonic.
 */
export function dayan(
  out: Float32Array,
  sr: number,
  start: number,
  stroke: Stroke,
  f: number,
  level: number,
  rand: Rand,
  hand = 0,
): void {
  const { gains, t80 } = strokes[stroke];
  const settle = curve(
    out.length - start,
    sr,
    (t) => 1 + 0.015 * Math.exp(-t / 0.01),
    1,
  );
  let total = 0;
  gains.forEach((gain, i) => {
    const amp = gain * level * jitter(rand, 0.1);
    const decay = fall80 / (t80[i] ?? 1) + hand;
    const partial = f * (i + 1) * (dayanDetune[i] ?? 1);
    modeBend(out, sr, start, partial, amp, decay, settle);
    total += amp;
  });
  exciter(out, sr, start, total * 0.2, rand);
  if (stroke === "te") {
    burst(
      out,
      sr,
      start,
      { f: 900, q: 1.5, length: 0.012, level: total * 0.6 },
      rand,
    );
  }
}

/** The bayan 'ge': a skin that glides along `bend` (in cents above `f`), then the palm rests on it and it dies away. */
export function bayan(
  out: Float32Array,
  sr: number,
  start: number,
  f: number,
  level: number,
  rand: Rand,
  bend?: Bend,
): void {
  const body = silence(1, sr);
  const settled = bend === undefined ? 1 : cents(bend.to);
  const glide = curve(
    body.length,
    sr,
    (t) => {
      const pitch =
        bend === undefined
          ? 1
          : cents(
              bend.from +
                (bend.to - bend.from) * ease((t - bend.delay) / bend.time),
            );
      return pitch * (1 + 0.01 * Math.exp(-t / 0.01));
    },
    settled,
  );
  bayanGains.forEach((gain, i) => {
    const partial = f * (i + 1) * (bayanDetune[i] ?? 1);
    modeBend(
      body,
      sr,
      0,
      partial,
      gain * jitter(rand, 0.1),
      fall80 / 0.7,
      glide,
    );
  });
  if (bend !== undefined) {
    const rest = at(bend.delay + bend.time, sr);
    const damping = Math.exp(-hands.held / sr);
    let envelope = 1;
    for (let i = rest; i < body.length; i++) {
      body[i]! *= envelope;
      envelope *= damping;
    }
  }
  const drive = Math.tanh(1.3);
  for (let i = 0; i < body.length; i++) {
    body[i] = Math.tanh(body[i]! * 1.3) / drive;
  }
  mix(out, body, start, level);
  burst(
    out,
    sr,
    start,
    { f: 500, q: 0.9, length: 0.015, level: level * 0.8 },
    rand,
  );
  exciter(out, sr, start, level * 0.4, rand);
}

/** A closed left-hand slap. */
export function ka(
  out: Float32Array,
  sr: number,
  start: number,
  level: number,
  rand: Rand,
): void {
  burst(
    out,
    sr,
    start,
    { f: 350, q: 1.5, length: 0.035, level: level * 1.6 },
    rand,
  );
  burst(
    out,
    sr,
    start,
    { f: 1200, q: 1.5, length: 0.025, level: level * 0.7 },
    rand,
  );
}

/** Modal synthesis: d_n = d_hand + π · tan φ · f_n, and a contact pulse that brightens a short hit. */
export function impact(
  out: Float32Array,
  sr: number,
  start: number,
  material: Material,
  prime: number,
  rand: Rand,
  { force = 1, hand = "free", ring, click = true }: ImpactOptions = {},
): void {
  const modes = materials[material];
  const handDecay = typeof hand === "number" ? hand : hands[hand];
  const contact = modes.contact * jitter(rand, 0.15);
  let total = 0;
  modes.ratios.forEach((ratio, i) => {
    const f = prime * ratio;
    if (f >= sr * 0.45) return;
    const weight = 1 / (1 + (f * contact) ** 2);
    const amp = (modes.gains[i] ?? 0) * weight * force * jitter(rand, 0.1);
    let decay = handDecay + Math.PI * modes.tanPhi * f;
    if (ring !== undefined) decay = Math.max(decay, t60 / ring);
    modeFixed(out, sr, start, f, amp, decay);
    if (modes.doublet !== undefined) {
      modeFixed(out, sr, start, f + modes.doublet, amp * 0.6, decay);
    }
    total += amp;
  });
  if (click) exciter(out, sr, start, total * 0.2, rand);
}

/** A tiffin latch: a steel snap with two small rebounds. */
export function snap(
  out: Float32Array,
  sr: number,
  start: number,
  f: number,
  rand: Rand,
  force = 1,
): void {
  impact(out, sr, start, "steelPlate", f, rand, { force, hand: 40 });
  impact(
    out,
    sr,
    start + at(0.003 * jitter(rand, 0.3), sr),
    "steelPlate",
    f,
    rand,
    { force: force * 0.3, hand: 60, click: false },
  );
  impact(
    out,
    sr,
    start + at(0.008 * jitter(rand, 0.3), sr),
    "steelPlate",
    f,
    rand,
    { force: force * 0.12, hand: 80, click: false },
  );
}

/** The click of a spoon on steel or glass. */
export function spoon(
  out: Float32Array,
  sr: number,
  start: number,
  level: number,
  rand: Rand,
): void {
  burst(out, sr, start, { f: 5000, q: 0.7, length: 0.0004, level }, rand);
}

/** A bicycle bell: two domes struck about 30 times a second, with a small click on each strike. */
export function bellBurst(
  out: Float32Array,
  sr: number,
  start: number,
  strikes: number,
  domes: readonly number[],
  rand: Rand,
): void {
  let t = 0;
  for (let s = 0; s < strikes; s++) {
    const strikeAt = start + at(t, sr);
    const strength = jitter(rand, 0.15) * (s >= strikes - 2 ? 0.7 : 1);
    domes.forEach((f, k) => {
      const force = strength * (k === 0 ? 1 : 0.8) * jitter(rand, 0.2);
      for (const [ratio, gain] of bellModes) {
        const decay = Math.max(Math.PI * 0.001 * f * ratio, t60 / 0.5);
        modeFixed(out, sr, strikeAt, f * ratio, gain * force * 0.25, decay);
      }
    });
    burst(
      out,
      sr,
      strikeAt,
      { f: 6000, q: 0.8, length: 0.002, level: 0.3 * strength },
      rand,
    );
    t += (1 / 30) * jitter(rand, 0.15);
  }
}

/**
 * A soft contact, measured from recordings: band-passed noise only, no ringing modes. Each layer is
 * { at: ms, ratio: to the centre `f0`, q, db, fall: dB per ms, rise: ms, riseDb }, and timings vary ±15%.
 */
export function contact(
  out: Float32Array,
  sr: number,
  start: number,
  level: number,
  f0: number,
  { layers, exciter: hit }: Contact,
  rand: Rand,
): void {
  for (const layer of layers) {
    const onset = start + at((layer.at / 1000) * jitter(rand, 0.15), sr);
    burst(
      out,
      sr,
      onset,
      {
        f: f0 * layer.ratio,
        q: layer.q,
        length: (80 / layer.fall / 1000) * jitter(rand, 0.15),
        level: level * 10 ** ((layer.db + (rand() * 2 - 1)) / 20),
        attack: layer.rise / 1000,
        attackDb: layer.riseDb ?? 0,
      },
      rand,
    );
  }
  if (hit !== undefined) {
    const hitAt = start + at(hit.at / 1000, sr);
    exciter(out, sr, hitAt, level * 10 ** (hit.db / 20), rand);
  }
}

/** The slip torn from the bill book: perforation clicks that speed up, then the paper flap. */
export function slipTear(
  out: Float32Array,
  sr: number,
  start: number,
  rand: Rand,
): void {
  crackle(
    out,
    sr,
    start,
    { length: 0.25, rateFrom: 80, rateTo: 250, band: [2000, 6000] },
    rand,
  );
  burst(
    out,
    sr,
    start + at(0.27, sr),
    { f: 1000, q: 0.8, length: 0.03, level: 0.8 },
    rand,
  );
}

/** Poisson-timed clicks of 1 to 3 ms in a band, with event energies on a power law. */
export function crackle(
  out: Float32Array,
  sr: number,
  start: number,
  {
    length,
    rateFrom,
    rateTo = rateFrom,
    band: [low, high],
    fall = false,
  }: CrackleOptions,
  rand: Rand,
): void {
  let t = 0;
  while (t < length) {
    const progress = t / length;
    const centre = fall
      ? high * (low / high) ** progress
      : low + (high - low) * rand();
    const energy = Math.min(30, (1 - rand()) ** -2);
    burst(
      out,
      sr,
      start + at(t, sr),
      {
        f: centre,
        q: 1.5,
        length: 0.001 + rand() * 0.002,
        level: Math.min(0.7, 0.3 * Math.sqrt(energy)),
      },
      rand,
    );
    t += -Math.log(1 - rand()) / (rateFrom + (rateTo - rateFrom) * progress);
  }
}

export function coefficients(
  type: FilterType,
  f: number,
  q: number,
  sr: number,
  gainDb = 0,
): Biquad {
  const w0 = (tau * Math.min(f, sr * 0.45)) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b: [number, number, number];
  let a: [number, number, number];
  if (type === "highpass") {
    b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    a = [1 + alpha, -2 * cos, 1 - alpha];
  } else if (type === "highshelf") {
    const g = 10 ** (gainDb / 40);
    const s = 2 * Math.sqrt(g) * alpha;
    b = [
      g * (g + 1 + (g - 1) * cos + s),
      -2 * g * (g - 1 + (g + 1) * cos),
      g * (g + 1 + (g - 1) * cos - s),
    ];
    a = [
      g + 1 - (g - 1) * cos + s,
      2 * (g - 1 - (g + 1) * cos),
      g + 1 - (g - 1) * cos - s,
    ];
  } else {
    b = [alpha, 0, -alpha];
    a = [1 + alpha, -2 * cos, 1 - alpha];
  }
  return [b[0] / a[0], b[1] / a[0], b[2] / a[0], a[1] / a[0], a[2] / a[0]];
}

export function filterInPlace(
  data: Float32Array,
  [b0, b1, b2, a1, a2]: Biquad,
): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i]!;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    data[i] = y;
  }
}

function burst(
  out: Float32Array,
  sr: number,
  start: number,
  { f, q = 1, length, level = 1, attack = 0, attackDb = 0 }: BurstOptions,
  rand: Rand,
): void {
  const count = Math.min(
    out.length - start,
    Math.ceil((length + attack + 0.02) * sr),
  );
  if (count <= 0 || level === 0) return;
  const noise = new Float32Array(count);
  const decay = Math.exp(-fall80 / (length * sr));
  const rise = Math.max(1, Math.round(attack * sr));
  const stop = rise - 1 + Math.ceil(length * sr);
  let envelope = level;
  for (let i = 0; i < stop && i < count; i++) {
    const progress = Math.min(1, (i + 1) / rise);
    const shape =
      attackDb > 0 ? 10 ** ((-attackDb * (1 - progress)) / 20) : progress;
    noise[i] = (rand() * 2 - 1) * envelope * shape;
    if (i + 1 >= rise) envelope *= decay;
  }
  filterInPlace(noise, coefficients("bandpass", f, q, sr));
  mix(out, noise, start);
}

/** The shared exciter of every struck sound: band-pass noise at 3.2 kHz, 5 ms. */
function exciter(
  out: Float32Array,
  sr: number,
  start: number,
  level: number,
  rand: Rand,
): void {
  burst(out, sr, start, { f: 3200, q: 1.5, length: 0.005, level }, rand);
}

/** A fixed mode as a two-pole resonator: y[n] = 2R cos θ · y[n−1] − R² · y[n−2]. */
function modeFixed(
  out: Float32Array,
  sr: number,
  start: number,
  f: number,
  amp: number,
  decay: number,
): void {
  if (f <= 0 || f >= sr * 0.45 || amp === 0 || start >= out.length) return;
  const r = Math.exp(-decay / sr);
  const theta = (tau * f) / sr;
  const c1 = 2 * r * Math.cos(theta);
  const c2 = r * r;
  let y2 = 0;
  let y1 = amp * r * Math.sin(theta);
  let envelope = amp * r;
  for (let i = start + 1; i < out.length && envelope > 1e-6; i++) {
    out[i]! += y1;
    const y = c1 * y1 - c2 * y2;
    y2 = y1;
    y1 = y;
    envelope *= r;
  }
}

/**
 * A damped sine whose pitch follows `bend` (a skin under the hand): a phase accumulator while the
 * pitch moves, then the two-pole resonator from the sample where it has settled.
 */
function modeBend(
  out: Float32Array,
  sr: number,
  start: number,
  f: number,
  amp: number,
  decay: number,
  bend: Curve,
): void {
  if (amp === 0 || start >= out.length) return;
  const r = Math.exp(-decay / sr);
  const limit = sr * 0.45;
  let phase = 0;
  let envelope = amp;
  let i = start;
  for (let k = 0; k < bend.steady && i < out.length && envelope > 1e-6; k++) {
    const now = f * (bend.values[k] ?? 1);
    phase += (tau * now) / sr;
    if (now < limit) out[i]! += envelope * Math.sin(phase);
    envelope *= r;
    i++;
  }
  const steady = f * bend.settled;
  if (steady >= limit || i >= out.length || envelope <= 1e-6) return;
  const theta = (tau * steady) / sr;
  const c1 = 2 * r * Math.cos(theta);
  const c2 = r * r;
  let y1 = (envelope / r) * Math.sin(phase);
  let y2 = (envelope / (r * r)) * Math.sin(phase - theta);
  for (; i < out.length && envelope > 1e-6; i++) {
    const y = c1 * y1 - c2 * y2;
    out[i]! += y;
    y2 = y1;
    y1 = y;
    envelope *= r;
  }
}

function mix(
  out: Float32Array,
  source: Float32Array,
  start: number,
  gain = 1,
): void {
  for (let i = 0; i < source.length && start + i < out.length; i++) {
    out[start + i]! += source[i]! * gain;
  }
}

/** The values of a pitch ratio until it settles within 1e-9 of `settled`. */
function curve(
  length: number,
  sr: number,
  value: (t: number) => number,
  settled: number,
): Curve {
  const values = new Float64Array(Math.max(0, length));
  let steady = values.length;
  for (let k = 0; k < values.length; k++) {
    const now = value(k / sr);
    if (Math.abs(now - settled) <= 1e-9) {
      steady = k;
      break;
    }
    values[k] = now;
  }
  return { values, steady, settled };
}

function ease(x: number): number {
  const p = Math.min(1, Math.max(0, x));
  return 1 - (1 - p) ** 2;
}

export function silence(
  seconds: number,
  sr: number,
): Float32Array<ArrayBuffer> {
  return new Float32Array(Math.max(1, Math.ceil(seconds * sr)));
}

export function at(seconds: number, sr: number): number {
  return Math.max(0, Math.round(seconds * sr));
}

export function cents(value: number): number {
  return 2 ** (value / 1200);
}

export function jitter(rand: Rand, amount: number): number {
  return 1 + (rand() * 2 - 1) * amount;
}

/** mulberry32: the same seed gives the same small variations on every device. */
export function random(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
