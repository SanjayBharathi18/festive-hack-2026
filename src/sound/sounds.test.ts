import assert from "node:assert/strict";
import { test } from "node:test";
import { peakLimit, renderSound, type Rendered } from "./render.ts";
import {
  cueKey,
  cues,
  ma,
  raag,
  roles,
  sa,
  swara,
  type Cue,
  type RoleId,
} from "./sounds.ts";

const sr = 48_000;
const cases: readonly Cue[] = [
  cues.tick(),
  cues.tick(1),
  cues.tick(2),
  cues.tick(4),
  ...Array.from({ length: 11 }, (_, quantity) => cues.step(quantity)),
  cues.pick(true),
  cues.pick(false),
  cues.record("start"),
  cues.record("stop"),
  cues.limit(),
  cues.error(),
  cues.stamp("making"),
  cues.stamp("paid"),
  cues.commit("sent"),
  cues.commit("publish"),
  cues.cancel(),
  cues.undo(),
  cues.cascade(1),
  cues.cascade(4),
  cues.cascade(6),
  cues.cascade(4, [2]),
  cues.cascade(6, [0, 5]),
  cues.settle(),
  cues.avail("open"),
  cues.avail("close"),
  cues.avail("pause"),
  cues.avail("resume"),
  cues.working(),
  cues.fallback(),
  cues.arrival("order"),
  cues.arrival("quote"),
  cues.saved(),
  cues.placed(),
];
const sounds: readonly (readonly [Cue, Rendered])[] = cases.map((cue) => [
  cue,
  renderSound(cue, sr),
]);

test("each role has a take in the build and is rendered here", () => {
  const rendered = new Set(cases.map((cue) => cue.role));
  for (const role of Object.keys(roles) as RoleId[]) {
    assert.ok(rendered.has(role), `${role} is not rendered`);
  }
});

test("each prime sits within ±5 cents of a swara of Bhupali on E, and Ma is only in the error", () => {
  for (const [cue, sound] of sounds) {
    assert.ok(sound.primes.length > 0, cueKey(cue));
    for (const { f, foreign } of sound.primes) {
      if (foreign) {
        assert.equal(cue.role, "error", `${cueKey(cue)}: Ma outside the error`);
        assert.ok(Math.abs(centsFrom(f, ma())) <= 5, `${cueKey(cue)}: ${f} Hz`);
      } else {
        const off = centsFromRaag(f);
        assert.ok(
          Math.abs(off) <= 5,
          `${cueKey(cue)}: ${f} Hz is ${off} cents off`,
        );
      }
    }
  }
});

test("each sound is within ±1 dB of its tier, with its peak at −3 dBFS or lower", () => {
  for (const [cue, sound] of sounds) {
    const off = sound.loudness - sound.target;
    assert.ok(
      Math.abs(off) <= 1,
      `${cueKey(cue)}: ${sound.loudness.toFixed(1)} dB for tier ${sound.target}${sound.peakLimited ? ", held back by the peak limit" : ""}`,
    );
    assert.ok(
      sound.peak <= peakLimit * 1.001,
      `${cueKey(cue)}: peak ${sound.peak}`,
    );
  }
});

test("90% of the energy is above 300 Hz, 2% at most is below 200 Hz, and no prime is below 200 Hz", () => {
  for (const [cue, sound] of sounds) {
    const band = bandShare(sound.data, sr);
    assert.ok(
      band.above300 >= 0.9,
      `${cueKey(cue)}: ${band.above300} above 300 Hz`,
    );
    assert.ok(
      band.below200 <= 0.02,
      `${cueKey(cue)}: ${band.below200} below 200 Hz`,
    );
    for (const { f } of sound.primes) {
      assert.ok(f >= 200, `${cueKey(cue)}: a prime at ${f} Hz`);
    }
  }
});

test("positive roles end on the positive ending, negative roles fall, and the others use neither", () => {
  for (const [cue, sound] of sounds) {
    const positive = sound.marks.includes("positive");
    const negative = sound.marks.includes("negative");
    const outcome = roles[cue.role].outcome;
    if (outcome === "positive") {
      assert.equal(sound.marks.at(-1), "positive", cueKey(cue));
      assert.equal(negative, false, cueKey(cue));
    } else if (outcome === "negative") {
      assert.equal(negative, true, cueKey(cue));
      assert.equal(positive, false, cueKey(cue));
    } else {
      assert.deepEqual(sound.marks, [], cueKey(cue));
    }
  }
});

test("each frequent sound has three renders that differ only in small details", () => {
  for (const cue of [cues.tick(), cues.step(3), cues.stamp("ready")]) {
    const renders = [0, 1, 2].map((seed) => renderSound(cue, sr, seed));
    const [first, second] = renders;
    assert.notDeepEqual(first?.data, second?.data);
    for (const render of renders) {
      for (const { f } of render.primes)
        assert.ok(Math.abs(centsFromRaag(f)) <= 3);
      assert.ok(Math.abs(render.loudness - render.target) <= 1);
    }
  }
});

test("a pack plays its tick on its swara: 250 g Sa, 500 g Ga, 1 kg Pa", () => {
  assert.deepEqual(cues.tick(), { role: "tick", params: { degree: 0 } });
  assert.deepEqual(cues.tick(0), cues.tick());
  assert.deepEqual(cues.tick(1).params, { degree: 2 });
  assert.deepEqual(cues.tick(2).params, { degree: 3 });
  assert.deepEqual(cues.tick(9).params, { degree: 5 });
  assert.deepEqual(cues.tick(-1).params, { degree: 0 });
  assert.equal(swara(2, 1).toFixed(1), "824.1");
});

test("a step plays the new quantity: 1 to 10 on Sa to the upper Dha, 0 on a closed stroke", () => {
  assert.deepEqual(cues.step(4), { role: "step", params: { quantity: 4 } });
  assert.deepEqual(cues.step(2.6).params, { quantity: 3 });
  assert.deepEqual(cues.step(25).params, { quantity: 10 });
  assert.deepEqual(cues.step(-3).params, { quantity: 0 });
  assert.deepEqual(cues.step(Number.NaN).params, { quantity: 0 });
  assert.equal(swara(9).toFixed(1), "1098.8");
});

test("every status stamps the same; PAID is the ink pad, then the stamp", () => {
  const plain = cues.stamp("making");
  for (const status of ["new", "ready", "delivered", "picked_up"] as const) {
    assert.deepEqual(cues.stamp(status), plain);
  }
  assert.deepEqual(cues.stamp("paid"), {
    role: "stamp",
    params: { paid: true },
  });
});

test("a cascade has one note for each field, and an unsure field makes it the unsure role", () => {
  assert.deepEqual(cues.cascade(4), {
    role: "cascade",
    params: { fields: 4, unsure: [] },
  });
  assert.deepEqual(cues.cascade(9).params, { fields: 6, unsure: [] });
  assert.deepEqual(cues.cascade(0).params, { fields: 1, unsure: [] });
  assert.deepEqual(cues.cascade(4, [3, 1, 1, 7, -1, 0.5]), {
    role: "unsure",
    params: { fields: 4, unsure: [1, 3] },
  });
});

test("the other roles keep their form", () => {
  assert.deepEqual(cues.record("start").params, { start: true });
  assert.deepEqual(cues.record("stop").params, { start: false });
  assert.deepEqual(cues.pick(true).params, { in: true });
  assert.deepEqual(cues.commit().params, { publish: false });
  assert.deepEqual(cues.commit("publish").params, { publish: true });
  assert.deepEqual(cues.avail("pause").params, { action: "pause" });
  assert.deepEqual(cues.arrival().params, { kind: "order" });
  assert.deepEqual(cues.arrival("quote").params, { kind: "quote" });
  assert.equal(cues.saved().role, "saved");
  assert.equal(cues.placed().role, "placed");
});

test("the raag is Bhupali on E, and Ma is 4/3 above Sa", () => {
  assert.equal(sa, 329.63);
  assert.deepEqual(raag, [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3]);
  assert.equal(ma(-1).toFixed(1), "219.8");
  assert.equal(swara(3, 2).toFixed(1), "1977.8");
  assert.equal(swara(-1).toFixed(1), "274.7");
});

test("each render of tick, step, pick, error, cancel and commit fits the length of its role, measured to −40 dB under its peak", () => {
  const limitsMs: Partial<Record<RoleId, number>> = {
    tick: 30,
    step: 120,
    pick: 120,
    error: 300,
    cancel: 400,
    commit: 600,
  };
  for (const cue of cases) {
    const limit = limitsMs[cue.role];
    if (limit === undefined) continue;
    for (const seed of [0, 1, 2]) {
      const { data } = renderSound(cue, sr, seed);
      const length = lengthMs(data, sr);
      assert.ok(
        length <= limit,
        `${cueKey(cue)} (seed ${seed}) is ${Math.round(length)} ms`,
      );
    }
  }
});

function lengthMs(data: Float32Array, rate: number): number {
  let peak = 0;
  for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  const floor = peak * 10 ** (-40 / 20);
  let last = data.length - 1;
  while (last > 0 && Math.abs(data[last]!) < floor) last--;
  return ((last + 1) / rate) * 1000;
}

function centsFromRaag(f: number): number {
  const position = (((1200 * Math.log2(f / sa)) % 1200) + 1200) % 1200;
  let best = Infinity;
  for (const ratio of raag) {
    const target = 1200 * Math.log2(ratio);
    for (const shift of [-1200, 0, 1200]) {
      const off = position - (target + shift);
      if (Math.abs(off) < Math.abs(best)) best = off;
    }
  }
  return best;
}

function centsFrom(f: number, reference: number): number {
  const off = (((1200 * Math.log2(f / reference)) % 1200) + 1200) % 1200;
  return off > 600 ? off - 1200 : off;
}

function bandShare(data: Float32Array, rate: number) {
  let size = 1;
  while (size < data.length) size <<= 1;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re.set(data);
  fft(re, im);
  let total = 0;
  let above300 = 0;
  let below200 = 0;
  for (let k = 1; k < size / 2; k++) {
    const power = re[k]! ** 2 + im[k]! ** 2;
    const f = (k * rate) / size;
    total += power;
    if (f >= 300) above300 += power;
    if (f < 200) below200 += power;
  }
  return { above300: above300 / total, below200: below200 / total };
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += length) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < length / 2; j++) {
        const a = i + j;
        const b = a + length / 2;
        const br = re[b]! * cr - im[b]! * ci;
        const bi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - br;
        im[b] = im[a]! - bi;
        re[a]! += br;
        im[a]! += bi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}
