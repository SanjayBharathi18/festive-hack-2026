import type { Stamp } from "../../shared/orders.ts";
import {
  at,
  bayan,
  bellBurst,
  contact,
  crackle,
  dayan,
  impact,
  ka,
  slipTear,
  snap,
  spoon,
  type Contact,
  type Rand,
} from "./synth.ts";

export type Family = "hand" | "counter" | "steel" | "logo";
export type Send = "hand" | "answer" | "hero";
export type Outcome = "positive" | "negative";
export type Tier = 1 | 2 | 3 | 4;
export type RecordMark = "start" | "stop";
export type CommitForm = "sent" | "publish";
export type AvailChange = "open" | "close" | "pause" | "resume";
export type ArrivalKind = "order" | "quote";
export type Role = {
  readonly family: Family;
  readonly tier: Tier;
  readonly send: Send;
  readonly outcome?: Outcome;
  readonly frequent: boolean;
  readonly take: string;
  readonly sound: string;
};

type Empty = Readonly<Record<never, never>>;
type Fields = { readonly fields: number; readonly unsure: readonly number[] };
type ParamsOf = {
  tick: { readonly degree: number };
  step: { readonly quantity: number };
  pick: { readonly in: boolean };
  record: { readonly start: boolean };
  limit: Empty;
  error: Empty;
  stamp: { readonly paid: boolean };
  commit: { readonly publish: boolean };
  cancel: Empty;
  undo: Empty;
  cascade: Fields;
  unsure: Fields;
  settle: Empty;
  avail: { readonly action: AvailChange };
  working: Empty;
  fallback: Empty;
  arrival: { readonly kind: ArrivalKind };
  saved: Empty;
  placed: Empty;
};

export type RoleId = keyof ParamsOf;
export type Cue = {
  [R in RoleId]: { readonly role: R; readonly params: ParamsOf[R] };
}[RoleId];
export type Draw = {
  readonly sr: number;
  readonly rand: Rand;
  swara(degree: number, octave?: number): number;
  ma(octave?: number): number;
  mark(outcome: Outcome): void;
};
export type Take<R extends RoleId> = {
  readonly seconds: number;
  draw(out: Float32Array, c: Draw, params: ParamsOf[R]): void;
};

/** Bhupali on E. Octave 0 holds the Sa near 330 Hz; degree 5 is the Sa above. */
export const sa = 329.63;
export const raag = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3] as const;
const maRatio = 4 / 3;

export const tierDb: Readonly<Record<Tier, number>> = {
  1: -32,
  2: -27,
  3: -23,
  4: -20,
};
export const sendLevels: Readonly<Record<Send, number>> = {
  hand: 0.04,
  answer: 0.1,
  hero: 0.18,
};

export const roles: { readonly [R in RoleId]: Role } = {
  tick: {
    family: "hand",
    tier: 1,
    send: "hand",
    frequent: true,
    take: "c",
    sound: "kulhad tok",
  },
  step: {
    family: "hand",
    tier: 1,
    send: "hand",
    frequent: true,
    take: "a",
    sound: "tabla tarang 'tin'",
  },
  pick: {
    family: "hand",
    tier: 1,
    send: "hand",
    frequent: true,
    take: "a",
    sound: "'na' on Pa, or 'te'",
  },
  record: {
    family: "hand",
    tier: 3,
    send: "hand",
    frequent: false,
    take: "a",
    sound: "'na–tin' up, 'tin–te' down",
  },
  limit: {
    family: "hand",
    tier: 2,
    send: "hand",
    outcome: "negative",
    frequent: false,
    take: "a",
    sound: "the negative fall",
  },
  error: {
    family: "hand",
    tier: 3,
    send: "hand",
    outcome: "negative",
    frequent: false,
    take: "a",
    sound: "the negative fall to Ma",
  },
  stamp: {
    family: "counter",
    tier: 2,
    send: "answer",
    frequent: true,
    take: "f",
    sound: "a real rubber stamp",
  },
  commit: {
    family: "counter",
    tier: 3,
    send: "answer",
    outcome: "positive",
    frequent: false,
    take: "f",
    sound: "the slip or the stamp, then the positive ending",
  },
  cancel: {
    family: "counter",
    tier: 2,
    send: "answer",
    outcome: "negative",
    frequent: false,
    take: "e",
    sound: "the slip torn fast, then the fall",
  },
  undo: {
    family: "counter",
    tier: 2,
    send: "answer",
    frequent: false,
    take: "a",
    sound: "two light wood taps",
  },
  cascade: {
    family: "hand",
    tier: 1,
    send: "answer",
    frequent: false,
    take: "f",
    sound: "tabla tarang 'tin'",
  },
  unsure: {
    family: "hand",
    tier: 1,
    send: "answer",
    outcome: "negative",
    frequent: false,
    take: "e",
    sound: "a small fall in the cascade",
  },
  settle: {
    family: "steel",
    tier: 2,
    send: "hero",
    outcome: "positive",
    frequent: false,
    take: "f",
    sound: "the positive ending",
  },
  avail: {
    family: "steel",
    tier: 2,
    send: "answer",
    frequent: false,
    take: "a",
    sound: "tiffin latch",
  },
  working: {
    family: "steel",
    tier: 2,
    send: "answer",
    frequent: false,
    take: "a",
    sound: "a spoon stirring a glass of chai",
  },
  fallback: {
    family: "hand",
    tier: 2,
    send: "answer",
    outcome: "negative",
    frequent: false,
    take: "e",
    sound: "a small fall to Sa",
  },
  arrival: {
    family: "steel",
    tier: 4,
    send: "hero",
    frequent: false,
    take: "a",
    sound: "bicycle bell",
  },
  saved: {
    family: "logo",
    tier: 4,
    send: "hero",
    outcome: "positive",
    frequent: false,
    take: "f",
    sound: "the slip, the stamp, the positive ending",
  },
  placed: {
    family: "logo",
    tier: 4,
    send: "hero",
    outcome: "positive",
    frequent: false,
    take: "f",
    sound: "the dabba, then the positive ending",
  },
};

const rubberStamp: Contact = {
  exciter: { at: 6, db: -26 },
  layers: [
    { at: 0, ratio: 1, q: 2, db: -18, fall: 6, rise: 6, riseDb: 30 },
    { at: 6, ratio: 1, q: 2.6, db: 0, fall: 4, rise: 1.2 },
    { at: 6, ratio: 1, q: 2.6, db: -12, fall: 0.7, rise: 1.2 },
    { at: 6, ratio: 0.51, q: 1.2, db: -15, fall: 0.6, rise: 1 },
    { at: 6, ratio: 13.1, q: 2.6, db: -10, fall: 8, rise: 0.5 },
    { at: 6, ratio: 9.1, q: 1.4, db: -29, fall: 0.32, rise: 1 },
    { at: 9.3, ratio: 13.1, q: 2.6, db: -17, fall: 8, rise: 0.2 },
  ],
};
const inkPad: Contact = {
  layers: [
    { at: 0, ratio: 1, q: 3, db: -21, fall: 0.14, rise: 9 },
    { at: 105, ratio: 16, q: 1, db: -25, fall: 10, rise: 0.2 },
  ],
};
const padToStamp = 0.22;

// A hand sound is 120 ms or shorter (docs/sound.md, "Roles"), so the hand
// stops the skin of a 'tin' or a 'na' soon after the stroke, and the counter
// stops the kulhad that is set down on it (d_hand, per second).
const stoppedSkin = 40;
const setDown = 110;

/** The takes "in the build" of `extra/sound-synth.js` (its PICKS table). */
export const takes: { readonly [R in RoleId]: Take<R> } = {
  tick: {
    seconds: 0.2,
    draw: (out, c, { degree }) =>
      impact(out, c.sr, 0, "clay", c.swara(degree, 1), c.rand, {
        hand: setDown,
      }),
  },
  step: {
    seconds: 0.7,
    draw: (out, c, { quantity }) =>
      quantity <= 0
        ? dayan(out, c.sr, 0, "te", c.swara(0), 1, c.rand)
        : dayan(
            out,
            c.sr,
            0,
            "tin",
            c.swara(quantity - 1),
            1,
            c.rand,
            stoppedSkin,
          ),
  },
  pick: {
    seconds: 0.6,
    draw: (out, c, params) =>
      params.in
        ? dayan(out, c.sr, 0, "na", c.swara(3), 1, c.rand, stoppedSkin)
        : dayan(out, c.sr, 0, "te", c.swara(0), 1, c.rand),
  },
  record: {
    seconds: 1,
    draw(out, c, { start }) {
      const second = at(0.06, c.sr);
      if (start) {
        dayan(out, c.sr, 0, "na", c.swara(0), 1, c.rand);
        dayan(out, c.sr, second, "tin", c.swara(3), 1, c.rand);
      } else {
        dayan(out, c.sr, 0, "tin", c.swara(3), 1, c.rand);
        dayan(out, c.sr, second, "te", c.swara(0), 1.1, c.rand);
      }
    },
  },
  limit: { seconds: 1, draw: (out, c) => limitFall(out, c, 0, 1) },
  error: {
    seconds: 1,
    draw(out, c) {
      negativeFall(out, c, 0, c.ma(-1), 400, 0.22);
      ka(out, c.sr, 0, 1, c.rand);
    },
  },
  stamp: {
    seconds: 0.8,
    draw(out, c, { paid }) {
      if (!paid) return stampDown(out, c, 0);
      contact(out, c.sr, 0, 1, c.swara(3, -1), inkPad, c.rand);
      stampDown(out, c, at(padToStamp, c.sr));
    },
  },
  commit: {
    seconds: 1.3,
    draw(out, c, { publish }) {
      if (publish) {
        stampDown(out, c, 0);
        positiveEnding(out, c, at(0.12, c.sr), 1);
      } else {
        slipTear(out, c.sr, 0, c.rand);
        positiveEnding(out, c, at(0.3, c.sr), 0.8);
      }
    },
  },
  cancel: {
    seconds: 1.1,
    draw(out, c) {
      crackle(
        out,
        c.sr,
        0,
        { length: 0.12, rateFrom: 250, band: [2000, 6000], fall: true },
        c.rand,
      );
      limitFall(out, c, at(0.1, c.sr), 0.9);
    },
  },
  undo: {
    seconds: 0.35,
    draw(out, c) {
      impact(out, c.sr, 0, "wood", c.swara(3, 1), c.rand, { force: 0.6 });
      impact(out, c.sr, at(0.07, c.sr), "wood", c.swara(0, 1), c.rand, {
        force: 0.7,
      });
    },
  },
  cascade: { seconds: 1.2, draw: (out, c, params) => cascade(out, c, params) },
  unsure: { seconds: 1.2, draw: (out, c, params) => cascade(out, c, params) },
  settle: { seconds: 0.9, draw: (out, c) => positiveEnding(out, c, 0, 1) },
  avail: { seconds: 0.6, draw: (out, c, { action }) => latch(out, c, action) },
  working: {
    seconds: 1.3,
    draw(out, c) {
      for (let k = 0; k < 5; k++) {
        const start = at(k * 0.18 + (c.rand() * 2 - 1) * 0.02 + 0.02, c.sr);
        const f = k % 2 ? c.swara(0, 3) : c.swara(3, 2);
        const force = 0.708 ** k;
        impact(out, c.sr, start, "glass", f, c.rand, {
          ring: 0.3,
          force,
          click: false,
        });
        spoon(out, c.sr, start, 0.25 * force, c.rand);
      }
    },
  },
  fallback: { seconds: 1, draw: (out, c) => smallFall(out, c, 0, 1) },
  arrival: {
    seconds: 1.5,
    draw(out, c, { kind }) {
      bellBurst(out, c.sr, 0, 11, [c.swara(3, 2), c.swara(4, 2)], c.rand);
      if (kind === "quote") return;
      const domes = [c.swara(3, 2), c.swara(4, 2)];
      bellBurst(out, c.sr, at(0.45, c.sr), 11, domes, c.rand);
    },
  },
  saved: {
    seconds: 1.3,
    draw(out, c) {
      slipTear(out, c.sr, 0, c.rand);
      stampDown(out, c, at(0.3, c.sr));
      positiveEnding(out, c, at(0.42, c.sr), 1.1);
    },
  },
  placed: {
    seconds: 1.3,
    draw(out, c) {
      for (const degree of [0, 1, 2]) {
        const start = at(degree * 0.07, c.sr);
        impact(out, c.sr, start, "steelPlate", c.swara(degree, 2), c.rand, {
          hand: "held",
        });
      }
      snap(out, c.sr, at(0.22, c.sr), c.swara(2, 2), c.rand, 1);
      positiveEnding(out, c, at(0.3, c.sr), 1.1);
    },
  },
};

const packDegrees = [0, 2, 3, 4, 5];
const maxStepQuantity = 10;
const maxFields = 6;

/** The role mapping: what a page means, as the role and its parameters. */
export const cues = {
  tick: (pack?: number): Cue => ({
    role: "tick",
    params: {
      degree:
        pack === undefined
          ? 0
          : packDegrees[clamp(Math.trunc(pack), 0, packDegrees.length - 1)]!,
    },
  }),
  step: (quantity: number): Cue => ({
    role: "step",
    params: { quantity: clamp(Math.round(quantity), 0, maxStepQuantity) },
  }),
  pick: (chosen: boolean): Cue => ({ role: "pick", params: { in: chosen } }),
  record: (mark: RecordMark): Cue => ({
    role: "record",
    params: { start: mark === "start" },
  }),
  limit: (): Cue => ({ role: "limit", params: {} }),
  error: (): Cue => ({ role: "error", params: {} }),
  stamp: (status: Stamp | "paid"): Cue => ({
    role: "stamp",
    params: { paid: status === "paid" },
  }),
  commit: (form: CommitForm = "sent"): Cue => ({
    role: "commit",
    params: { publish: form === "publish" },
  }),
  cancel: (): Cue => ({ role: "cancel", params: {} }),
  undo: (): Cue => ({ role: "undo", params: {} }),
  cascade: (fields: number, unsure: readonly number[] = []): Cue => {
    const count = clamp(Math.round(fields), 1, maxFields);
    const flagged = [...new Set(unsure)]
      .filter((field) => Number.isInteger(field) && field >= 0 && field < count)
      .sort((a, b) => a - b);
    return {
      role: flagged.length > 0 ? "unsure" : "cascade",
      params: { fields: count, unsure: flagged },
    };
  },
  settle: (): Cue => ({ role: "settle", params: {} }),
  avail: (change: AvailChange): Cue => ({
    role: "avail",
    params: { action: change },
  }),
  working: (): Cue => ({ role: "working", params: {} }),
  fallback: (): Cue => ({ role: "fallback", params: {} }),
  arrival: (kind: ArrivalKind = "order"): Cue => ({
    role: "arrival",
    params: { kind },
  }),
  saved: (): Cue => ({ role: "saved", params: {} }),
  placed: (): Cue => ({ role: "placed", params: {} }),
};

/** Rendered in idle time after the page loads, so the first tap does not wait. */
export const core: readonly Cue[] = [
  cues.tick(),
  cues.tick(1),
  cues.tick(2),
  cues.step(1),
  cues.step(2),
  cues.step(3),
  cues.step(0),
  cues.pick(true),
  cues.pick(false),
  cues.record("start"),
  cues.record("stop"),
  cues.stamp("making"),
  cues.stamp("paid"),
  cues.undo(),
  cues.limit(),
  cues.error(),
  cues.settle(),
  cues.saved(),
  cues.placed(),
  cues.arrival(),
];

/** Every positive outcome ends so: a katori on the lower Pa, then one up on Sa 80 ms later, which rings. */
function positiveEnding(
  out: Float32Array,
  c: Draw,
  start: number,
  level: number,
): void {
  c.mark("positive");
  katori(out, c, start, 3, 1, 0.75 * level);
  katori(out, c, start + at(0.08, c.sr), 0, 2, level);
}

/** Every negative outcome has it: the bayan glides down to `landing` and dies away. */
function negativeFall(
  out: Float32Array,
  c: Draw,
  start: number,
  landing: number,
  fromCents: number,
  time: number,
  level = 1,
): void {
  c.mark("negative");
  bayan(out, c.sr, start, landing, level, c.rand, {
    from: fromCents,
    to: 0,
    delay: 0,
    time,
  });
}

function limitFall(
  out: Float32Array,
  c: Draw,
  start: number,
  level: number,
): void {
  const landing = c.swara(4, -1);
  const fromCents = 1200 * Math.log2(c.swara(0) / landing);
  negativeFall(out, c, start, landing, fromCents, 0.22, level);
}

function smallFall(
  out: Float32Array,
  c: Draw,
  start: number,
  level: number,
): void {
  const landing = c.swara(0);
  const fromCents = 1200 * Math.log2(c.swara(1) / landing);
  negativeFall(out, c, start, landing, fromCents, 0.15, level);
}

function katori(
  out: Float32Array,
  c: Draw,
  start: number,
  degree: number,
  octave: number,
  force: number,
): void {
  impact(out, c.sr, start, "steelBowl", c.swara(degree, octave), c.rand, {
    ring: 0.4,
    force,
  });
  spoon(out, c.sr, start, 0.3 * force, c.rand);
}

function stampDown(out: Float32Array, c: Draw, start: number): void {
  contact(out, c.sr, start, 1, c.swara(4), rubberStamp, c.rand);
}

/** One 'tin' for each field, 45 ms apart, climbing to the upper Sa; an unsure field falls instead. */
function cascade(out: Float32Array, c: Draw, { fields, unsure }: Fields): void {
  for (let k = 0; k < fields; k++) {
    const start = at(k * 0.045, c.sr);
    if (unsure.includes(k)) smallFall(out, c, start, 0.6);
    else
      dayan(out, c.sr, start, "tin", c.swara(5 - (fields - 1) + k), 1, c.rand);
  }
}

function latch(out: Float32Array, c: Draw, action: AvailChange): void {
  const opening = action === "open" || action === "resume";
  const [first, second] = opening
    ? [c.swara(0, 2), c.swara(3, 2)]
    : [c.swara(3, 2), c.swara(0, 2)];
  const repeats = action === "pause" || action === "resume" ? 2 : 1;
  for (let r = 0; r < repeats; r++) {
    const start = at(r * 0.12, c.sr);
    snap(out, c.sr, start, first, c.rand, 0.8);
    snap(out, c.sr, start + at(0.04, c.sr), second, c.rand, 1);
  }
}

export function swara(degree: number, octave = 0): number {
  const step = ((degree % 5) + 5) % 5;
  return sa * 2 ** (octave + Math.floor(degree / 5)) * raag[step]!;
}

export function ma(octave = 0): number {
  return sa * 2 ** octave * maRatio;
}

export function cueKey(cue: Cue): string {
  return `${cue.role}|${JSON.stringify(cue.params)}`;
}

function clamp(value: number, low: number, high: number): number {
  return Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : low;
}
