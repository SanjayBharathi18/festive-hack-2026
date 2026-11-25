const TAU = Math.PI * 2
const FALL_80_DB = Math.log(1e4)
const PEAK_LIMIT = 10 ** (-3 / 20)

export const RAAGS = {
  bhupali: { name: "Bhupali", ratios: [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3], foreign: 4 / 3, foreignName: "Ma" },
  durga: { name: "Durga", ratios: [1, 9 / 8, 4 / 3, 3 / 2, 5 / 3], foreign: 5 / 4, foreignName: "Ga" },
}
export const SA = { D: 293.66, E: 329.63, F: 349.23 }
export const TIERS = { 1: -32, 2: -27, 3: -23, 4: -20 }
export const SENDS = { hand: 0.04, answer: 0.1, hero: 0.18 }

const MATERIALS = {
  steelBowl: { ratios: [1, 2.83, 5.42, 8.77, 12.9], gains: [1, 0.5, 0.3, 0.15, 0.08], tanPhi: 0.001, doublet: 2, contact: 0.00015 },
  steelPlate: { ratios: [1, 1.73, 2.33, 3.91, 4.11], gains: [1, 0.6, 0.45, 0.25, 0.2], tanPhi: 0.001, contact: 0.0005 },
  brass: { ratios: [1, 1.73, 2.33, 3.91, 4.11], gains: [1, 0.55, 0.4, 0.2, 0.15], tanPhi: 0.002, contact: 0.0006 },
  glass: { ratios: [1, 2.83, 5.42], gains: [1, 0.45, 0.2], tanPhi: 0.002, doublet: 1.5, contact: 0.00008 },
  wood: { ratios: [1, 2.78, 5.44, 9], gains: [1, 0.5, 0.25, 0.12], tanPhi: 0.06, contact: 0.0015 },
  clay: { ratios: [1, 2.6, 4.9], gains: [1, 0.4, 0.15], tanPhi: 0.035, contact: 0.002 },
}
const HAND = { free: 0, held: 20, closed: 180 }
const DAYAN = {
  na: { gains: [0.08, 1, 0.6, 0.4, 0.25], t80: [0.08, 0.5, 0.4, 0.3, 0.25] },
  tin: { gains: [0.1, 1, 0.4, 0.15, 0.08], t80: [0.1, 0.9, 0.6, 0.4, 0.3] },
  te: { gains: [0.15, 0.6, 0.5, 0.35, 0.25], t80: [0.05, 0.05, 0.05, 0.05, 0.05] },
  ti: { gains: [0.05, 0.3, 0.6, 0.5, 0.4], t80: [0.04, 0.04, 0.04, 0.04, 0.04] },
  tun: { gains: [1, 0.5, 0.3, 0.15, 0.1], t80: [1, 0.6, 0.45, 0.35, 0.3] },
}
const DAYAN_DETUNE = [1, 1.002, 0.998, 1.003, 0.997]
const BAYAN_DETUNE = [1, 1.004, 0.997, 1.006]
const SANTOOR_COURSE = [-2, -0.7, 0.6, 1.9]
const RISE_TO_DHA = { from: 0, to: 182, delay: 0.025, time: 0.15 }

const STATUS_DEGREES = { making: [2, 1], ready: [3, 1], done: [0, 2] }
const PAD_TO_STAMP = 0.22
const FALL_80 = 80
const STAMP = {
  centre: [4, 0],
  exciterAt: 6,
  exciterDb: -26,
  layers: [
    { at: 0, ratio: 1, q: 2, db: -18, fall: 6, rise: 6, riseDb: 30 },
    { at: 6, ratio: 1, q: 2.6, db: 0, fall: 4, rise: 1.2 },
    { at: 6, ratio: 1, q: 2.6, db: -12, fall: 0.7, rise: 1.2 },
    { at: 6, ratio: 0.51, q: 1.2, db: -15, fall: 0.6, rise: 1 },
    { at: 6, ratio: 13.1, q: 2.6, db: -10, fall: 8, rise: 0.5 },
    { at: 6, ratio: 9.1, q: 1.4, db: -29, fall: 0.32, rise: 1 },
    { at: 9.3, ratio: 13.1, q: 2.6, db: -17, fall: 8, rise: 0.2 },
  ],
}
const INK_PAD = {
  centre: [3, -1],
  layers: [
    { at: 0, ratio: 1, q: 3, db: -21, fall: 0.14, rise: 9 },
    { at: 105, ratio: 16, q: 1, db: -25, fall: 10, rise: 0.2 },
  ],
}

const sound = (seconds, draw) => (c) => {
  const out = silence(seconds, c.sr)
  draw(out, c)
  return out
}

export const ROLES = [
  {
    id: "tick",
    name: "Tick",
    says: "Got it. A choice with a value (a pack size) plays on its swara.",
    family: "hand",
    tier: 1,
    send: "hand",
    demo: [
      [0, {}],
      [0.25, {}],
      [0.5, {}],
      [0.95, { value: 0 }],
      [1.2, { value: 2 }],
      [1.45, { value: 3 }],
    ],
    variants: {
      a: {
        name: "closed dayan 'te'",
        recipe: "a closed stroke, no ring; a pack size plays 'na' on Sa, Ga or Pa",
        render: sound(0.35, (out, c) =>
          c.params.value === undefined ? dayan(out, c.sr, 0, "te", c.S(0, 0), 1, c.rand) : dayan(out, c.sr, 0, "na", c.S(c.params.value, 0), 1, c.rand),
        ),
      },
      b: {
        name: "tiffin micro-click",
        recipe: "a small steel catch, damped by the hand, on upper Sa",
        render: sound(0.2, (out, c) => impact(out, c.sr, 0, "steelPlate", c.S(c.params.value ?? 0, c.params.value === undefined ? 3 : 2), { hand: "closed", rand: c.rand })),
      },
      c: {
        name: "kulhad tok",
        recipe: "a dry clay cup set down, on Sa",
        render: sound(0.2, (out, c) => impact(out, c.sr, 0, "clay", c.S(c.params.value ?? 0, 1), { hand: "held", rand: c.rand })),
      },
    },
  },
  {
    id: "step",
    name: "Step (+ and −)",
    says: "The new quantity: 1 to 10 maps to Sa to upper Dha; 0 is a closed 'te'.",
    family: "hand",
    tier: 1,
    send: "hand",
    demo: [1, 2, 3, 4, 3, 2, 1, 0].map((quantity, i) => [i * 0.14, { quantity }]),
    variants: {
      a: {
        name: "tabla tarang 'tin'",
        recipe: "a dayan 'tin' tuned to the swara of the new quantity",
        render: sound(0.7, (out, c) => stepStroke(out, c, (degree) => dayan(out, c.sr, 0, "tin", c.S(degree, 0), 1, c.rand))),
      },
      b: {
        name: "spoon on tuned katoris",
        recipe: "a jal tarang: held steel bowls, from Sa up to upper Sa at most",
        render: sound(0.5, (out, c) =>
          stepStroke(out, c, (degree) => {
            impact(out, c.sr, 0, "steelBowl", c.S(Math.min(degree, 5), 2), { hand: "held", rand: c.rand })
            spoon(out, c.sr, 0, 0.3, c.rand)
          }),
        ),
      },
      c: {
        name: "santoor",
        recipe: "a hammered course of four strings, tuned to the quantity",
        render: sound(0.95, (out, c) => stepStroke(out, c, (degree) => santoor(out, c.sr, 0, c.S(degree, 1), 1, c.rand))),
      },
    },
  },
  {
    id: "pick",
    name: "Pick (in or out)",
    says: "In or out of my choice: a dish on a plate, a quick button in setup.",
    family: "hand",
    tier: 1,
    send: "hand",
    demo: [
      [0, { in: true }],
      [0.35, { in: false }],
    ],
    variants: {
      a: {
        name: "'na' on Pa, or 'te'",
        recipe: "in: dayan 'na' on Pa; out: a closed 'te'",
        render: sound(0.6, (out, c) => (c.params.in ? dayan(out, c.sr, 0, "na", c.S(3, 0), 1, c.rand) : dayan(out, c.sr, 0, "te", c.S(0, 0), 1, c.rand))),
      },
      b: {
        name: "'na' Sa then Pa",
        recipe: "in: 'na' on Sa, then on Pa, 60 ms apart; out: 'na' on Pa, then 'te'",
        render: sound(0.7, (out, c) => {
          if (c.params.in) {
            dayan(out, c.sr, 0, "na", c.S(0, 0), 0.8, c.rand)
            dayan(out, c.sr, at(0.06, c.sr), "na", c.S(3, 0), 1, c.rand)
          } else {
            dayan(out, c.sr, 0, "na", c.S(3, 0), 0.8, c.rand)
            dayan(out, c.sr, at(0.06, c.sr), "te", c.S(0, 0), 1, c.rand)
          }
        }),
      },
      c: {
        name: "a katori pair",
        recipe: "held steel bowls: Sa then Pa (in), Pa then Sa (out)",
        render: sound(0.5, (out, c) => {
          const [first, second] = c.params.in ? [0, 3] : [3, 0]
          impact(out, c.sr, 0, "steelBowl", c.S(first, 2), { hand: "held", force: 0.8, rand: c.rand })
          impact(out, c.sr, at(0.06, c.sr), "steelBowl", c.S(second, 2), { hand: "held", rand: c.rand })
        }),
      },
    },
  },
  {
    id: "record",
    name: "Record (start, stop)",
    says: "Microphone open, microphone shut. Nothing plays while it is open.",
    family: "hand",
    tier: 3,
    send: "hand",
    demo: [
      [0, { start: true }],
      [0.9, { start: false }],
    ],
    variants: {
      a: {
        name: "'na–tin' up, 'tin–te' down",
        recipe: "start: 'na' on Sa, then 'tin' on Pa, 60 ms apart; stop: 'tin' on Pa, then a closed 'te'",
        render: sound(1, (out, c) => {
          if (c.params.start) {
            dayan(out, c.sr, 0, "na", c.S(0, 0), 1, c.rand)
            dayan(out, c.sr, at(0.06, c.sr), "tin", c.S(3, 0), 1, c.rand)
          } else {
            dayan(out, c.sr, 0, "tin", c.S(3, 0), 1, c.rand)
            dayan(out, c.sr, at(0.06, c.sr), "te", c.S(0, 0), 1.1, c.rand)
          }
        }),
      },
      b: {
        name: "santoor Sa–Pa, Pa–Sa",
        recipe: "two hammered strokes, 60 ms apart, up to start and down to stop",
        render: sound(1, (out, c) => {
          const [first, second] = c.params.start ? [0, 3] : [3, 0]
          santoor(out, c.sr, 0, c.S(first, 1), 1, c.rand)
          santoor(out, c.sr, at(0.06, c.sr), c.S(second, 1), 1, c.rand)
        }),
      },
      c: {
        name: "tumbler double clink",
        recipe: "held steel tumbler: Sa then Pa to start, Pa then Sa to stop, 50 ms apart",
        render: sound(0.5, (out, c) => {
          const [first, second] = c.params.start ? [0, 3] : [3, 0]
          impact(out, c.sr, 0, "steelBowl", c.S(first, 2), { hand: "held", rand: c.rand })
          impact(out, c.sr, at(0.05, c.sr), "steelBowl", c.S(second, 2), { hand: "held", rand: c.rand })
        }),
      },
    },
  },
  {
    id: "limit",
    name: "Limit",
    says: "A rule said no, and another option exists: a full day, a plate over its limit.",
    family: "hand",
    tier: 2,
    send: "hand",
    demo: [[0, {}]],
    variants: {
      a: {
        name: "bayan falls, lands in the raag",
        recipe: "bayan 'ge' falls from Sa (330 Hz) to lower Dha (275 Hz), 316 cents in 220 ms",
        render: sound(1, (out, c) => {
          const landing = c.S(4, -1)
          negativeFall(out, c, 0, landing, 1200 * Math.log2(c.S(0, 0) / landing), 0.22)
        }),
      },
      b: {
        name: "the brass tarazu tips",
        recipe: "a brass pan clunks on Pa, then Sa, with a wooden thock",
        render: sound(0.8, (out, c) => {
          impact(out, c.sr, 0, "brass", c.S(3, 1), { ring: 0.4, rand: c.rand })
          impact(out, c.sr, at(0.09, c.sr), "brass", c.S(0, 1), { ring: 0.5, force: 1.1, rand: c.rand })
          impact(out, c.sr, at(0.09, c.sr), "wood", c.S(0, 1), { hand: "closed", force: 0.6, rand: c.rand })
        }),
      },
      c: {
        name: "two closed 'te', the second lower",
        recipe: "'te' on Pa, then 'te' on Sa, 120 ms apart",
        render: sound(0.5, (out, c) => {
          dayan(out, c.sr, 0, "te", c.S(3, 0), 1, c.rand)
          dayan(out, c.sr, at(0.12, c.sr), "te", c.S(0, 0), 1, c.rand)
        }),
      },
    },
  },
  {
    id: "error",
    name: "Error",
    says: "It failed: do the next step. It lands on the one note outside the raag.",
    family: "hand",
    tier: 3,
    send: "hand",
    demo: [[0, {}]],
    variants: {
      a: {
        name: "bayan falls to Ma, with 'ka'",
        recipe: "bayan 'ge' falls 400 cents to Ma (220 Hz) in 220 ms, with a closed left-hand slap",
        render: sound(1, (out, c) => {
          negativeFall(out, c, 0, c.F(-1), 400, 0.22)
          ka(out, c.sr, 0, 1, c.rand)
        }),
      },
      b: {
        name: "two wooden knocks",
        recipe: "a knock on Sa, then a lower one on Dha, 120 ms apart",
        render: sound(0.5, (out, c) => {
          impact(out, c.sr, 0, "wood", c.S(0, 1), { rand: c.rand })
          impact(out, c.sr, at(0.12, c.sr), "wood", c.S(4, 0), { rand: c.rand })
        }),
      },
      c: {
        name: "two 'na', the second on Ma",
        recipe: "'na' on Sa, then 'na' on Ma, 120 ms apart",
        render: sound(0.8, (out, c) => {
          dayan(out, c.sr, 0, "na", c.S(0, 0), 1, c.rand)
          dayan(out, c.sr, at(0.12, c.sr), "na", c.F(0), 1, c.rand)
        }),
      },
    },
  },
  {
    id: "stamp",
    name: "Stamp",
    says: "I set this status. Each status sits one swara higher; PAID is the ink pad, then the stamp.",
    family: "counter",
    tier: 2,
    send: "answer",
    demo: [
      [0, { status: "making" }],
      [0.5, { status: "ready" }],
      [1, { status: "done" }],
      [1.6, { status: "paid" }],
    ],
    variants: {
      a: {
        name: "rubber stamp, rising with the status",
        recipe: "noise bands at the status swara (MAKING Ga, READY Pa, DELIVERED upper Sa), a smack, a quiet lift",
        render: sound(0.65, (out, c) => statusStamp(out, c, true)),
      },
      b: {
        name: "the same stamp on Sa",
        recipe: "every status on Sa; PAID with the ink pad",
        render: sound(0.65, (out, c) => statusStamp(out, c, false)),
      },
      c: {
        name: "tabla 'dha'",
        recipe: "dayan 'na' with the bayan rising Pa to Dha; PAID adds a 'te' first",
        render: sound(0.9, (out, c) => {
          const start = c.params.status === "paid" ? at(0.12, c.sr) : 0
          if (c.params.status === "paid") dayan(out, c.sr, 0, "te", c.S(0, 0), 0.8, c.rand)
          dha(out, c, start, 1)
        }),
      },
    },
  },
  {
    id: "commit",
    name: "Commit",
    says: "Sent (Contact seller, a board post) or published (the store goes live).",
    family: "counter",
    tier: 3,
    send: "answer",
    demo: [
      [0, { publish: false }],
      [0.9, { publish: true }],
    ],
    variants: {
      a: {
        name: "slip torn from the bill book",
        recipe: "perforation clicks speeding up from 80 to 250 a second, then the paper flap; publish: the stamp, then a katori",
        render: sound(0.95, (out, c) => {
          if (c.params.publish) {
            bandStamp(out, c.sr, 0, c.S(0, 1), c.S(0, 2), 1, c.rand)
            katori(out, c, at(0.12, c.sr), 0, 2, 1)
          } else slipTear(out, c.sr, 0, c.rand)
        }),
      },
      b: {
        name: "a bill-book page flick",
        recipe: "a quick paper swish, 90 ms; publish adds a katori",
        render: sound(0.9, (out, c) => {
          sweep(out, c.sr, 0, { from: 1500, to: 4000, q: 1.2, length: 0.09, level: 1 }, c.rand)
          if (c.params.publish) katori(out, c, at(0.12, c.sr), 0, 2, 1)
        }),
      },
      c: {
        name: "slip; publish lights a match",
        recipe: "the slip tear; publish: a matchstick scrape and flare, then a katori",
        render: sound(1.1, (out, c) => {
          if (c.params.publish) {
            matchstick(out, c.sr, 0, c.rand)
            katori(out, c, at(0.25, c.sr), 0, 2, 1)
          } else slipTear(out, c.sr, 0, c.rand)
        }),
      },
    },
  },
  {
    id: "cancel",
    name: "Cancel",
    says: "Released: an order cancelled with a reason, a post closed.",
    family: "counter",
    tier: 2,
    send: "answer",
    demo: [[0, {}]],
    variants: {
      a: {
        name: "the slip torn fast in two",
        recipe: "120 ms of tearing, the band falls from 6 to 2 kHz, no flap",
        render: sound(0.25, (out, c) => crackle(out, c.sr, 0, { length: 0.12, rateFrom: 250, band: [2000, 6000], fall: true }, c.rand)),
      },
      b: {
        name: "the stamp's lift and a 'te'",
        recipe: "the lift click, then a closed 'te' on Sa",
        render: sound(0.4, (out, c) => {
          burst(out, c.sr, 0, { f: 3200, q: 2, length: 0.006, level: 0.6 }, c.rand)
          dayan(out, c.sr, at(0.06, c.sr), "te", c.S(0, 0), 1, c.rand)
        }),
      },
    },
  },
  {
    id: "undo",
    name: "Undo",
    says: "Reversed: the act's own sound, mirrored. A stamp undo is two light wood taps.",
    family: "counter",
    tier: 2,
    send: "answer",
    demo: [[0, {}]],
    variants: {
      a: {
        name: "two light wood taps, falling",
        recipe: "wood on Pa, then on Sa, 70 ms apart",
        render: sound(0.35, (out, c) => {
          impact(out, c.sr, 0, "wood", c.S(3, 1), { force: 0.6, rand: c.rand })
          impact(out, c.sr, at(0.07, c.sr), "wood", c.S(0, 1), { force: 0.7, rand: c.rand })
        }),
      },
    },
  },
  {
    id: "cascade",
    name: "Cascade",
    says: "Your words became fields: one note for each field, climbing to upper Sa.",
    family: "hand",
    tier: 1,
    send: "answer",
    demo: [[0, { fields: 4 }]],
    variants: {
      a: {
        name: "steel katoris, like a jal tarang",
        recipe: "one bowl for each field, 45 ms apart, the last on upper Sa (2637 Hz)",
        render: sound(1, (out, c) => fields(out, c, (start, degree, unsure) => katori(out, c, start, degree, 2, unsure ? 0.5 : 1, unsure ? "held" : "free"))),
      },
      b: {
        name: "santoor",
        recipe: "one hammered note for each field, ending on Sa",
        render: sound(1.2, (out, c) => fields(out, c, (start, degree, unsure) => santoor(out, c.sr, start, c.S(degree, 1), unsure ? 0.5 : 1, c.rand))),
      },
      c: {
        name: "tabla tarang 'tin'",
        recipe: "one 'tin' for each field, ending on Sa",
        render: sound(1.2, (out, c) =>
          fields(out, c, (start, degree, unsure) => dayan(out, c.sr, start, unsure ? "te" : "tin", c.S(degree, 0), unsure ? 0.6 : 1, c.rand)),
        ),
      },
    },
  },
  {
    id: "unsure",
    name: "Unsure",
    says: "Check this field: in the cascade, its note is a small, soft fall.",
    family: "hand",
    tier: 1,
    send: "answer",
    demo: [[0, { fields: 4, unsure: 2 }]],
    variants: {
      a: {
        name: "the field's katori, held",
        recipe: "the cascade with the third field held by the hand, 6 dB softer",
        render: sound(1, (out, c) => fields(out, c, (start, degree, unsure) => katori(out, c, start, degree, 2, unsure ? 0.5 : 1, unsure ? "held" : "free"))),
      },
      b: {
        name: "a muted 'te' in its place",
        recipe: "the cascade with a closed 'te' for the third field",
        render: sound(1, (out, c) =>
          fields(out, c, (start, degree, unsure) => (unsure ? dayan(out, c.sr, start, "te", c.S(0, 0), 0.8, c.rand) : katori(out, c, start, degree, 2, 1))),
        ),
      },
    },
  },
  {
    id: "settle",
    name: "Settle",
    says: "Done: the server agreed. A code accepted, an edit saved, an online payment.",
    family: "steel",
    tier: 2,
    send: "hero",
    demo: [[0, {}]],
    variants: {
      a: {
        name: "steel katori on Sa",
        recipe: "struck with a spoon, free ring of 0.5 s at most",
        render: sound(0.8, (out, c) => katori(out, c, 0, 0, 2, 1)),
      },
      b: {
        name: "'tin' into a plain Sa",
        recipe: "one 'tin' on Sa; its ring passes into a plain sine on Sa",
        render: sound(1, (out, c) => {
          dayan(out, c.sr, 0, "tin", c.S(0, 0), 1, c.rand)
          sine(out, c.sr, at(0.03, c.sr), c.S(0, 1), 0.3, 0.04, 0.6)
        }),
      },
      c: {
        name: "santoor Sa",
        recipe: "one hammered Sa",
        render: sound(1, (out, c) => santoor(out, c.sr, 0, c.S(0, 1), 1, c.rand)),
      },
    },
  },
  {
    id: "avail",
    name: "Open and closed",
    says: "Buyers can or cannot order now: sold out, a closed date, a paused store.",
    family: "steel",
    tier: 2,
    send: "answer",
    demo: [
      [0, { action: "close" }],
      [0.5, { action: "open" }],
      [1, { action: "pause" }],
      [1.6, { action: "resume" }],
    ],
    variants: {
      a: {
        name: "tiffin latch",
        recipe: "open: two snaps, Sa then Pa; close: Pa then Sa; pause and resume use both latches",
        render: sound(0.6, (out, c) => toggle(out, c, (start, f, force) => snap(out, c.sr, start, f, c.rand, force))),
      },
      b: {
        name: "steel dabba lid",
        recipe: "a lid lifted (Sa to Pa) or set down (Pa to Sa)",
        render: sound(0.8, (out, c) => toggle(out, c, (start, f, force) => lid(out, c.sr, start, f, c.rand, force))),
      },
      c: {
        name: "ladle and pot",
        recipe: "closed: a ladle scrapes an empty pot; open: it taps a full one",
        render: sound(0.8, (out, c) => {
          const opening = c.params.action === "open" || c.params.action === "resume"
          const repeats = c.params.action === "pause" || c.params.action === "resume" ? 2 : 1
          for (let r = 0; r < repeats; r++) {
            const start = at(r * 0.22, c.sr)
            if (opening) {
              impact(out, c.sr, start, "steelBowl", c.S(0, 1), { hand: 60, rand: c.rand })
            } else {
              sweep(out, c.sr, start, { from: 1200, to: 2400, q: 3, length: 0.16, level: 1.2 }, c.rand)
              impact(out, c.sr, start + at(0.15, c.sr), "steelBowl", c.S(3, 1), { hand: "held", force: 0.25, rand: c.rand, click: false })
            }
          }
        }),
      },
    },
  },
  {
    id: "working",
    name: "Working",
    says: "The app is reading a voice note: plays once when the wait passes 1 s.",
    family: "steel",
    tier: 2,
    send: "answer",
    demo: [[0, {}]],
    variants: {
      a: {
        name: "a spoon stirring a glass of chai",
        recipe: "5 soft glass clinks in 0.9 s, alternating Pa and Sa, each 3 dB softer",
        render: sound(1.3, (out, c) => {
          for (let k = 0; k < 5; k++) {
            const start = at(k * 0.18 + (c.rand() * 2 - 1) * 0.02 + 0.02, c.sr)
            const f = k % 2 ? c.S(0, 3) : c.S(3, 2)
            impact(out, c.sr, start, "glass", f, { ring: 0.3, force: 0.708 ** k, rand: c.rand, click: false })
            spoon(out, c.sr, start, 0.25 * 0.708 ** k, c.rand)
          }
        }),
      },
      b: {
        name: "breath",
        recipe: "breath noise around 2.5 kHz, a puff, the faintest flute tone on Sa",
        render: sound(1, (out, c) => breath(out, c.sr, 0, 0.9, c.S(0, 1), c.rand)),
      },
      c: {
        name: "tadka crackle",
        recipe: "hot-oil crackle at 3 to 10 kHz with five mustard-seed pops, 0.3 s",
        render: sound(0.45, (out, c) => {
          crackle(out, c.sr, 0, { length: 0.28, rateFrom: 400, band: [3000, 10000], level: 0.6 }, c.rand)
          for (const [i, offset] of [0.02, 0.065, 0.11, 0.16, 0.21].entries())
            burst(out, c.sr, at(offset, c.sr), { f: 1500 + i * 240, q: 3, length: 0.004, level: 1.5 }, c.rand)
        }),
      },
    },
  },
  {
    id: "fallback",
    name: "Fallback",
    says: "Voice failed, but your words are safe: a small fall that lands on Sa.",
    family: "hand",
    tier: 2,
    send: "answer",
    demo: [[0, {}]],
    variants: {
      a: {
        name: "a katori held on Pa",
        recipe: "a steel bowl on Pa, damped by the hand",
        render: sound(0.6, (out, c) => katori(out, c, 0, 3, 2, 1, "held")),
      },
      b: {
        name: "a breath that stops, then 'te'",
        recipe: "a short breath, cut, then a closed 'te'",
        render: sound(0.8, (out, c) => {
          breath(out, c.sr, 0, 0.4, c.S(0, 1), c.rand)
          dayan(out, c.sr, at(0.42, c.sr), "te", c.S(0, 0), 1, c.rand)
        }),
      },
    },
  },
  {
    id: "arrival",
    name: "Arrival",
    says: "Someone ordered. It must cut through a noisy kitchen. A quote request rings once.",
    family: "steel",
    tier: 4,
    send: "hero",
    demo: [
      [0, { kind: "order" }],
      [1.8, { kind: "quote" }],
    ],
    variants: {
      a: {
        name: "bicycle bell 'tring-tring'",
        recipe: "two domes on Pa and Dha, struck 30 times a second; two bursts of 350 ms",
        render: sound(1.5, (out, c) => {
          bellBurst(out, c, 0, 11)
          if (c.params.kind !== "quote") bellBurst(out, c, at(0.45, c.sr), 11)
        }),
      },
      b: {
        name: "chaidaan rattle",
        recipe: "glasses in a tea carrier: 7 clinks in 0.3 s on Pa, Dha and upper Sa",
        render: sound(0.9, (out, c) => {
          const count = c.params.kind === "quote" ? 4 : 7
          for (let k = 0; k < count; k++) {
            const start = at(Math.min(0.3, (k / count) * 0.3 + c.rand() * 0.03), c.sr)
            const f = [c.S(3, 2), c.S(4, 2), c.S(0, 3)][Math.floor(c.rand() * 3)]
            impact(out, c.sr, start, "glass", f, { ring: 0.35, force: 0.6 + c.rand() * 0.4, rand: c.rand })
          }
        }),
      },
      c: {
        name: "the bell as one long trill",
        recipe: "the same domes, one burst of 18 strikes",
        render: sound(1.4, (out, c) => bellBurst(out, c, 0, c.params.kind === "quote" ? 9 : 18)),
      },
    },
  },
  {
    id: "saved",
    name: "Order saved (seller)",
    says: "The sound logo: slip, stamp, katori. It lands with the 600 ms slip move.",
    family: "logo",
    tier: 4,
    send: "hero",
    demo: [[0, {}]],
    variants: {
      a: {
        name: "slip, stamp, katori",
        recipe: "the slip (0 to 250 ms), the stamp on Sa at 300 ms, a katori on Sa at 420 ms",
        render: sound(1.2, (out, c) => {
          slipTear(out, c.sr, 0, c.rand)
          bandStamp(out, c.sr, at(0.3, c.sr), c.S(0, 1), c.S(0, 2), 1, c.rand)
          katori(out, c, at(0.42, c.sr), 0, 2, 1.1)
        }),
      },
      b: {
        name: "tabla tihai, lands on sam",
        recipe: "'te-dha' three times in 420 ms; the last 'dha' is sam, into a plain Sa",
        render: sound(1.3, (out, c) => {
          for (const [g, level] of [0.6, 0.75, 1].entries()) {
            const start = at(g * 0.18, c.sr)
            dayan(out, c.sr, start, "te", c.S(0, 0), level * 0.8, c.rand)
            dha(out, c, start + at(0.06, c.sr), level, g === 2)
          }
          sine(out, c.sr, at(0.45, c.sr), c.S(0, 1), 0.25, 0.04, 0.6)
        }),
      },
      c: {
        name: "slip, stamp, tabla 'dha'",
        recipe: "the slip, the stamp at 300 ms, a 'dha' on sam at 420 ms",
        render: sound(1.2, (out, c) => {
          slipTear(out, c.sr, 0, c.rand)
          bandStamp(out, c.sr, at(0.3, c.sr), c.S(0, 1), c.S(0, 2), 1, c.rand)
          dha(out, c, at(0.42, c.sr), 1, true)
        }),
      },
    },
  },
  {
    id: "placed",
    name: "Order placed (buyer)",
    says: "Quotes the logo: the slip, then the katori.",
    family: "logo",
    tier: 4,
    send: "hero",
    demo: [[0, {}]],
    variants: {
      a: {
        name: "slip, then katori",
        recipe: "the slip (0 to 250 ms), then a katori on Sa at 300 ms",
        render: sound(1.1, (out, c) => {
          slipTear(out, c.sr, 0, c.rand)
          katori(out, c, at(0.3, c.sr), 0, 2, 1.1)
        }),
      },
      b: {
        name: "santoor tremolo, Pa to upper Sa",
        recipe: "two mallets, strokes 80 ms apart: Pa Pa Sa Sa Sa",
        render: sound(1.3, (out, c) => {
          const strokes = [c.S(3, 1), c.S(3, 1), c.S(0, 2), c.S(0, 2), c.S(0, 2)]
          strokes.forEach((f, i) => santoor(out, c.sr, at(i * 0.08, c.sr), f, (i % 2 ? 0.75 : 1) * (i === 4 ? 1.15 : 1), c.rand))
        }),
      },
      c: {
        name: "your dabba is packed",
        recipe: "three tiffin tiers stacked, a latch, then a katori on Sa",
        render: sound(1.1, (out, c) => {
          ;[0, 1, 2].forEach((degree, i) => impact(out, c.sr, at(i * 0.07, c.sr), "steelPlate", c.S(degree, 2), { hand: "held", rand: c.rand }))
          snap(out, c.sr, at(0.24, c.sr), c.S(3, 2), c.rand, 1)
          katori(out, c, at(0.34, c.sr), 0, 2, 1.1)
        }),
      },
    },
  },
]

const MORE_VARIANTS = {
  tick: {
    d: {
      name: "dayan 'ti'",
      recipe: "a bright closed stroke at the rim; a pack size plays it on its swara",
      render: sound(0.3, (out, c) => dayan(out, c.sr, 0, "ti", c.S(c.params.value ?? 0, 1), 1, c.rand)),
    },
    e: {
      name: "bayan 'ka'",
      recipe: "a flat left-hand slap with no pitch; a pack size adds a soft 'te' on its swara",
      render: sound(0.3, (out, c) => {
        burst(out, c.sr, 0, { f: 520, q: 1.5, length: 0.03, level: 1.6 }, c.rand)
        burst(out, c.sr, 0, { f: 1300, q: 1.5, length: 0.02, level: 0.7 }, c.rand)
        exciter(out, c.sr, 0, 0.3, c.rand)
        if (c.params.value !== undefined) dayan(out, c.sr, 0, "te", c.S(c.params.value, 0), 0.6, c.rand)
      }),
    },
  },
  step: {
    d: {
      name: "tabla tarang 'na'",
      recipe: "a crisp dayan 'na' tuned to the swara of the new quantity",
      render: sound(0.7, (out, c) => stepStroke(out, c, (degree) => dayan(out, c.sr, 0, "na", c.S(degree, 0), 1, c.rand))),
    },
    e: {
      name: "tabla tarang 'tun'",
      recipe: "a round, open dayan 'tun' tuned to the quantity; the fundamental leads",
      render: sound(1.1, (out, c) => stepStroke(out, c, (degree) => dayan(out, c.sr, 0, "tun", c.S(degree, 0), 1, c.rand))),
    },
  },
  pick: {
    d: {
      name: "'tin' on Pa, or on Sa",
      recipe: "in: 'tin' on Pa; out: 'tin' on Sa",
      render: sound(1, (out, c) => dayan(out, c.sr, 0, "tin", c.S(c.params.in ? 3 : 0, 0), 1, c.rand)),
    },
    e: {
      name: "'dha' in, 'ka' out",
      recipe: "in: a 'dha', the bayan rising Pa to Dha; out: a flat left-hand slap",
      render: sound(0.9, (out, c) => (c.params.in ? dha(out, c, 0, 1, true) : ka(out, c.sr, 0, 1, c.rand))),
    },
  },
  record: {
    d: {
      name: "'tin–tin', up and down",
      recipe: "start: 'tin' on Sa, then on Pa; stop: 'tin' on Pa, then on Sa; 60 ms apart",
      render: sound(1.1, (out, c) => {
        const [first, second] = c.params.start ? [0, 3] : [3, 0]
        dayan(out, c.sr, 0, "tin", c.S(first, 0), 0.9, c.rand)
        dayan(out, c.sr, at(0.06, c.sr), "tin", c.S(second, 0), 1, c.rand)
      }),
    },
    e: {
      name: "'dha–tin' up, 'tin–ka' down",
      recipe: "start: a 'dha', then 'tin' on Pa; stop: 'tin' on Pa, then a left-hand slap",
      render: sound(1.1, (out, c) => {
        if (c.params.start) {
          dha(out, c, 0, 0.9)
          dayan(out, c.sr, at(0.06, c.sr), "tin", c.S(3, 0), 1, c.rand)
        } else {
          dayan(out, c.sr, 0, "tin", c.S(3, 0), 1, c.rand)
          ka(out, c.sr, at(0.06, c.sr), 1, c.rand)
        }
      }),
    },
  },
  limit: {
    d: {
      name: "a short bayan fall, Re to Sa",
      recipe: "the bayan falls 204 cents to Sa in 150 ms: a smaller 'no'",
      render: sound(1, (out, c) => {
        const landing = c.S(0, 0)
        bayan(out, c.sr, 0, landing, 1, c.rand, { from: 1200 * Math.log2(c.S(1, 0) / landing), to: 0, delay: 0, time: 0.15 })
      }),
    },
    e: {
      name: "'te', then the bayan falls",
      recipe: "a closed 'te' on Pa, then the bayan falls Sa to lower Dha, 60 ms later",
      render: sound(1.1, (out, c) => {
        dayan(out, c.sr, 0, "te", c.S(3, 0), 0.8, c.rand)
        const landing = c.S(4, -1)
        bayan(out, c.sr, at(0.06, c.sr), landing, 1, c.rand, { from: 1200 * Math.log2(c.S(0, 0) / landing), to: 0, delay: 0, time: 0.22 })
      }),
    },
  },
  error: {
    d: {
      name: "bayan falls to Ma, with 'ka-ka'",
      recipe: "the fall to Ma with two left-hand slaps, 90 ms apart",
      render: sound(1, (out, c) => {
        bayan(out, c.sr, 0, c.F(-1), 1, c.rand, { from: 400, to: 0, delay: 0, time: 0.22 })
        ka(out, c.sr, 0, 1, c.rand)
        ka(out, c.sr, at(0.09, c.sr), 0.8, c.rand)
      }),
    },
    e: {
      name: "'na' on Sa, then the fall to Ma",
      recipe: "a 'na' on Sa, then the bayan falls to Ma 80 ms later, with no slap",
      render: sound(1.1, (out, c) => {
        dayan(out, c.sr, 0, "na", c.S(0, 0), 0.8, c.rand)
        bayan(out, c.sr, at(0.08, c.sr), c.F(-1), 1, c.rand, { from: 400, to: 0, delay: 0, time: 0.22 })
      }),
    },
  },
  stamp: {
    d: {
      name: "stamp with its wooden handle",
      recipe: "the rising stamp with a dull wood knock from the handle, on the status swara",
      render: sound(0.7, (out, c) => {
        statusStamp(out, c, true)
        const status = c.params.status ?? "making"
        const [degree] = status === "paid" ? [0] : STATUS_DEGREES[status]
        impact(out, c.sr, status === "paid" ? at(0.22, c.sr) : 0, "wood", c.S(degree, 1), { hand: "closed", force: 0.5, rand: c.rand })
      }),
    },
    e: {
      name: "double stamp, 'thak-thak'",
      recipe: "two hits 70 ms apart, the second softer, rising with the status; PAID: the pad, then two hits",
      render: sound(0.8, (out, c) => {
        const status = c.params.status ?? "making"
        const [degree, octave] = status === "paid" ? [0, 1] : STATUS_DEGREES[status]
        const start = status === "paid" ? at(0.22, c.sr) : 0
        if (status === "paid") bandStamp(out, c.sr, 0, c.S(0, 1), c.S(0, 2), 0.4, c.rand)
        bandStamp(out, c.sr, start, c.S(degree, octave), c.S(degree, octave + 1), 1, c.rand)
        bandStamp(out, c.sr, start + at(0.07, c.sr), c.S(degree, octave), c.S(degree, octave + 1), 0.6, c.rand)
      }),
    },
  },
  commit: {
    d: {
      name: "slip torn, then stamped lightly",
      recipe: "the slip tear, then a light stamp on Sa; publish: two stamps (Sa, upper Sa), then a katori",
      render: sound(1, (out, c) => {
        if (c.params.publish) {
          bandStamp(out, c.sr, 0, c.S(0, 1), c.S(0, 2), 1, c.rand)
          bandStamp(out, c.sr, at(0.12, c.sr), c.S(0, 2), c.S(0, 3), 0.8, c.rand)
          katori(out, c, at(0.24, c.sr), 0, 2, 1)
        } else {
          slipTear(out, c.sr, 0, c.rand)
          bandStamp(out, c.sr, at(0.3, c.sr), c.S(0, 1), c.S(0, 2), 0.5, c.rand)
        }
      }),
    },
    e: {
      name: "a carbon slip, torn slowly",
      recipe: "a slower tear (60 to 180 clicks a second over 320 ms) with a deeper flap; publish: a stamp, then katoris on Pa and Sa",
      render: sound(1, (out, c) => {
        if (c.params.publish) {
          bandStamp(out, c.sr, 0, c.S(0, 1), c.S(0, 2), 1, c.rand)
          katori(out, c, at(0.12, c.sr), 3, 2, 0.8)
          katori(out, c, at(0.2, c.sr), 0, 2, 1)
        } else carbonSlip(out, c.sr, 0, c.rand)
      }),
    },
  },
  cancel: {
    c: {
      name: "the slip crumpled",
      recipe: "dense paper crackle, 150 ms, fading",
      render: sound(0.3, (out, c) => crumple(out, c.sr, 0, c.rand)),
    },
    d: {
      name: "the stamp lifts, the slip slides away",
      recipe: "the lift click, then a paper slide falling from 3 to 1.5 kHz",
      render: sound(0.3, (out, c) => {
        burst(out, c.sr, 0, { f: 3200, q: 2, length: 0.006, level: 0.6 }, c.rand)
        sweep(out, c.sr, at(0.03, c.sr), { from: 3000, to: 1500, q: 1, length: 0.12, level: 1 }, c.rand)
      }),
    },
  },
  undo: {
    b: {
      name: "the stamp lifts, a wood tap",
      recipe: "the lift click, then a wood tap on Sa",
      render: sound(0.3, (out, c) => {
        burst(out, c.sr, 0, { f: 3200, q: 2, length: 0.006, level: 0.6 }, c.rand)
        impact(out, c.sr, at(0.05, c.sr), "wood", c.S(0, 1), { force: 0.7, rand: c.rand })
      }),
    },
    c: {
      name: "two paper flicks, falling",
      recipe: "a flick from 3 to 1.8 kHz, then one from 2 to 1.2 kHz",
      render: sound(0.3, (out, c) => {
        sweep(out, c.sr, 0, { from: 3000, to: 1800, q: 1.2, length: 0.06, level: 1 }, c.rand)
        sweep(out, c.sr, at(0.07, c.sr), { from: 2000, to: 1200, q: 1.2, length: 0.06, level: 0.9 }, c.rand)
      }),
    },
  },
  cascade: {
    d: {
      name: "steel tumblers",
      recipe: "held tumblers, crisper and shorter, 40 ms apart, ending on upper Sa",
      render: sound(0.8, (out, c) =>
        fields(
          out,
          c,
          (start, degree, unsure) => {
            impact(out, c.sr, start, "steelBowl", c.S(degree, 2), { hand: unsure ? 60 : "held", force: unsure ? 0.5 : 1, rand: c.rand })
            spoon(out, c.sr, start, 0.25, c.rand)
          },
          0.04,
        ),
      ),
    },
    e: {
      name: "a fast katori run",
      recipe: "the katoris 30 ms apart; the last one, on upper Sa, struck harder",
      render: sound(1, (out, c) => {
        const count = c.params.fields ?? 4
        fields(out, c, (start, degree, unsure) => katori(out, c, start, degree, 2, unsure ? 0.5 : degree === 5 ? 1.2 : 0.8, unsure ? "held" : "free"), 0.03)
        if (count === 0) katori(out, c, 0, 0, 2, 1)
      }),
    },
  },
  unsure: {
    c: {
      name: "a tumbler tick in its place",
      recipe: "the third field as a short, damped tumbler tick",
      render: sound(1, (out, c) =>
        fields(out, c, (start, degree, unsure) =>
          unsure ? impact(out, c.sr, start, "steelBowl", c.S(degree, 2), { hand: 60, force: 0.5, rand: c.rand }) : katori(out, c, start, degree, 2, 1),
        ),
      ),
    },
    d: {
      name: "the note, twice and soft",
      recipe: "the third field's katori struck twice, softly, 50 ms apart",
      render: sound(1, (out, c) =>
        fields(out, c, (start, degree, unsure) => {
          if (!unsure) return katori(out, c, start, degree, 2, 1)
          katori(out, c, start, degree, 2, 0.4, "held")
          katori(out, c, start + at(0.05, c.sr), degree, 2, 0.35, "held")
        }),
      ),
    },
  },
  settle: {
    d: {
      name: "a small katori on upper Sa",
      recipe: "a smaller bowl on upper Sa (2637 Hz), a shorter ring",
      render: sound(0.6, (out, c) => {
        impact(out, c.sr, 0, "steelBowl", c.S(0, 3), { ring: 0.35, rand: c.rand })
        spoon(out, c.sr, 0, 0.3, c.rand)
      }),
    },
    e: {
      name: "two katoris, Pa then Sa",
      recipe: "a small resolution: Pa, then Sa, 70 ms apart",
      render: sound(0.8, (out, c) => {
        katori(out, c, 0, 3, 2, 0.7)
        katori(out, c, at(0.07, c.sr), 0, 2, 1)
      }),
    },
  },
  avail: {
    d: {
      name: "a tiffin lid twist",
      recipe: "a click, a short scrape, a click: rising to open, falling to close",
      render: sound(0.8, (out, c) => {
        const action = c.params.action ?? "close"
        const opening = action === "open" || action === "resume"
        const repeats = action === "pause" || action === "resume" ? 2 : 1
        for (let r = 0; r < repeats; r++) {
          const start = at(r * 0.2, c.sr)
          const [first, second] = opening ? [c.S(0, 2), c.S(3, 2)] : [c.S(3, 2), c.S(0, 2)]
          snap(out, c.sr, start, first, c.rand, 0.7)
          sweep(out, c.sr, start + at(0.02, c.sr), { from: opening ? 1500 : 3000, to: opening ? 3000 : 1500, q: 2, length: 0.08, level: 0.5 }, c.rand)
          snap(out, c.sr, start + at(0.1, c.sr), second, c.rand, 1)
        }
      }),
    },
    e: {
      name: "the latch, with a katori hint",
      recipe: "the latch pair, then a faint katori on its last note",
      render: sound(0.9, (out, c) => {
        toggle(out, c, (start, f, force) => snap(out, c.sr, start, f, c.rand, force))
        const opening = c.params.action === "open" || c.params.action === "resume"
        const repeats = c.params.action === "pause" || c.params.action === "resume" ? 2 : 1
        katori(out, c, at(0.04 + (repeats - 1) * 0.12 + 0.04, c.sr), opening ? 3 : 0, 2, 0.4)
      }),
    },
  },
  working: {
    d: {
      name: "a slower stir",
      recipe: "4 soft glass clinks in 0.9 s, alternating Ga and upper Sa",
      render: sound(1.3, (out, c) => {
        for (let k = 0; k < 4; k++) {
          const start = at(k * 0.22 + (c.rand() * 2 - 1) * 0.02 + 0.02, c.sr)
          impact(out, c.sr, start, "glass", k % 2 ? c.S(0, 3) : c.S(2, 2), { ring: 0.3, force: 0.75 ** k, rand: c.rand, click: false })
          spoon(out, c.sr, start, 0.25 * 0.75 ** k, c.rand)
        }
      }),
    },
    e: {
      name: "chai poured into a glass",
      recipe: "a pour whose resonance rises from Pa to upper Sa as the glass fills, then a soft clink",
      render: sound(1.2, (out, c) => {
        sweep(out, c.sr, 0, { from: c.S(3, 1), to: c.S(0, 3), q: 6, length: 0.8, level: 1.2, attack: 0.08 }, c.rand)
        impact(out, c.sr, at(0.82, c.sr), "glass", c.S(0, 3), { ring: 0.3, force: 0.3, rand: c.rand })
      }),
    },
  },
  fallback: {
    c: {
      name: "a katori held on Re",
      recipe: "a steel bowl on Re, damped by the hand: open, not settled",
      render: sound(0.6, (out, c) => katori(out, c, 0, 1, 2, 1, "held")),
    },
    d: {
      name: "a tumbler tick, then a held Pa",
      recipe: "a damped tumbler tick, then a katori held on Pa",
      render: sound(0.7, (out, c) => {
        impact(out, c.sr, 0, "steelBowl", c.S(0, 2), { hand: 60, force: 0.6, rand: c.rand })
        katori(out, c, at(0.07, c.sr), 3, 2, 1, "held")
      }),
    },
  },
  arrival: {
    d: {
      name: "the bell, three short rings",
      recipe: "tring-tring-tring: three bursts of 7 strikes, 300 ms apart",
      render: sound(1.4, (out, c) => {
        const rings = c.params.kind === "quote" ? 1 : 3
        for (let r = 0; r < rings; r++) bellBurst(out, c, at(r * 0.3, c.sr), 7)
      }),
    },
    e: {
      name: "the bell on Sa and Pa",
      recipe: "the bicycle bell with its domes a fifth apart (Sa and Pa); two bursts",
      render: sound(1.5, (out, c) => {
        const domes = [c.S(0, 2), c.S(3, 2)]
        bellBurst(out, c, 0, 11, domes)
        if (c.params.kind !== "quote") bellBurst(out, c, at(0.45, c.sr), 11, domes)
      }),
    },
  },
  saved: {
    d: {
      name: "slip, stamp, two katoris",
      recipe: "the slip, the stamp at 300 ms, katoris on Pa at 420 ms and Sa at 500 ms",
      render: sound(1.2, (out, c) => {
        slipTear(out, c.sr, 0, c.rand)
        bandStamp(out, c.sr, at(0.3, c.sr), c.S(0, 1), c.S(0, 2), 1, c.rand)
        katori(out, c, at(0.42, c.sr), 3, 2, 0.8)
        katori(out, c, at(0.5, c.sr), 0, 2, 1.1)
      }),
    },
    e: {
      name: "slip, double stamp, katori",
      recipe: "the slip, two stamps at 300 and 370 ms, a katori on Sa at 450 ms",
      render: sound(1.2, (out, c) => {
        slipTear(out, c.sr, 0, c.rand)
        bandStamp(out, c.sr, at(0.3, c.sr), c.S(0, 1), c.S(0, 2), 1, c.rand)
        bandStamp(out, c.sr, at(0.37, c.sr), c.S(0, 1), c.S(0, 2), 0.6, c.rand)
        katori(out, c, at(0.45, c.sr), 0, 2, 1.1)
      }),
    },
  },
  placed: {
    d: {
      name: "slip, then katoris on Pa and Sa",
      recipe: "the slip, then katoris on Pa at 300 ms and Sa at 380 ms",
      render: sound(1.1, (out, c) => {
        slipTear(out, c.sr, 0, c.rand)
        katori(out, c, at(0.3, c.sr), 3, 2, 0.8)
        katori(out, c, at(0.38, c.sr), 0, 2, 1.1)
      }),
    },
    e: {
      name: "a carbon slip, then a long katori",
      recipe: "the slower carbon tear with a deeper flap, then a katori on Sa struck harder",
      render: sound(1.2, (out, c) => {
        carbonSlip(out, c.sr, 0, c.rand)
        katori(out, c, at(0.36, c.sr), 0, 2, 1.2)
      }),
    },
  },
}

const CLOSING_VARIANTS = {
  stamp: {
    f: {
      name: "a real rubber stamp",
      recipe: "the same stamp for every status; PAID: the ink pad, then the stamp",
      render: sound(0.8, (out, c) => {
        if (c.params.status !== "paid") return rubberStamp(out, c, 0, 1)
        inkPad(out, c, 0, 1)
        rubberStamp(out, c, at(PAD_TO_STAMP, c.sr), 1)
      }),
    },
  },
  commit: {
    f: {
      name: "slip or stamp, then the positive ending",
      recipe: "sent: the slip torn from the bill book, then the positive ending; publish: the rubber stamp, then the positive ending",
      render: sound(1.3, (out, c) => {
        if (c.params.publish) {
          rubberStamp(out, c, 0, 1)
          positiveEnding(out, c, at(0.12, c.sr), 1)
        } else {
          slipTear(out, c.sr, 0, c.rand)
          positiveEnding(out, c, at(0.3, c.sr), 0.8)
        }
      }),
    },
  },
  cancel: {
    e: {
      name: "the slip torn fast, then the fall",
      recipe: "the fast tear (120 ms, 6 to 2 kHz), then the negative fall: the bayan falls Sa to lower Dha",
      render: sound(1.1, (out, c) => {
        crackle(out, c.sr, 0, { length: 0.12, rateFrom: 250, band: [2000, 6000], fall: true }, c.rand)
        const landing = c.S(4, -1)
        negativeFall(out, c, at(0.1, c.sr), landing, 1200 * Math.log2(c.S(0, 0) / landing), 0.22, 0.9)
      }),
    },
  },
  cascade: {
    f: {
      name: "tabla tarang 'tin'; an unsure field falls",
      recipe: "one 'tin' for each field, ending on Sa; an unsure field plays the small fall instead",
      render: sound(1.2, (out, c) => fields(out, c, (start, degree, unsure) => tinField(out, c, start, degree, unsure))),
    },
  },
  unsure: {
    e: {
      name: "a small fall in the tabla cascade",
      recipe: "the 'tin' cascade; the third field is the small fall, Re to Sa, 4 dB softer",
      render: sound(1.2, (out, c) => fields(out, c, (start, degree, unsure) => tinField(out, c, start, degree, unsure))),
    },
  },
  fallback: {
    e: {
      name: "a small fall to Sa",
      recipe: "the negative fall, smaller: the bayan falls Re to Sa (204 cents) in 150 ms",
      render: sound(1, (out, c) => smallFall(out, c, 0, 1)),
    },
  },
  settle: {
    f: {
      name: "the positive ending",
      recipe: "a katori on the lower Pa (989 Hz), then one up on Sa (1318.5 Hz) 80 ms later, which rings",
      render: sound(0.9, (out, c) => positiveEnding(out, c, 0, 1)),
    },
  },
  saved: {
    f: {
      name: "slip, stamp, the positive ending",
      recipe: "the slip, the rubber stamp at 300 ms, then the lower Pa at 420 ms and Sa at 500 ms",
      render: sound(1.3, (out, c) => {
        slipTear(out, c.sr, 0, c.rand)
        rubberStamp(out, c, at(0.3, c.sr), 1)
        positiveEnding(out, c, at(0.42, c.sr), 1.1)
      }),
    },
  },
  placed: {
    f: {
      name: "the dabba, then the positive ending",
      recipe: "three tiffin tiers stacked, the latch at 220 ms, then the lower Pa at 300 ms and Sa at 380 ms",
      render: sound(1.3, (out, c) => {
        ;[0, 1, 2].forEach((degree, i) => impact(out, c.sr, at(i * 0.07, c.sr), "steelPlate", c.S(degree, 2), { hand: "held", rand: c.rand }))
        snap(out, c.sr, at(0.22, c.sr), c.S(2, 2), c.rand, 1)
        positiveEnding(out, c, at(0.3, c.sr), 1.1)
      }),
    },
  },
}

const PICKS = {
  tick: "c",
  step: "a",
  pick: "a",
  record: "a",
  limit: "a",
  error: "a",
  stamp: "f",
  commit: "f",
  cancel: "e",
  undo: "a",
  cascade: "f",
  unsure: "e",
  settle: "f",
  avail: "a",
  working: "a",
  fallback: "e",
  arrival: "a",
  saved: "f",
  placed: "f",
}
const OUTCOME = {
  settle: "positive",
  commit: "positive",
  saved: "positive",
  placed: "positive",
  limit: "negative",
  error: "negative",
  cancel: "negative",
  fallback: "negative",
  unsure: "negative",
}

for (const role of ROLES) {
  Object.assign(role.variants, MORE_VARIANTS[role.id], CLOSING_VARIANTS[role.id])
  role.pick = PICKS[role.id]
  role.outcome = OUTCOME[role.id]
}

export const NEW_VARIANTS = Object.fromEntries(Object.entries(CLOSING_VARIANTS).map(([roleId, variants]) => [roleId, Object.keys(variants)]))

export const ROLE_BY_ID = Object.fromEntries(ROLES.map((role) => [role.id, role]))

export function makeTuning(raag = "bhupali", sa = "E") {
  const { ratios, foreign } = RAAGS[raag]
  const base = SA[sa]
  return {
    raag,
    sa,
    base,
    ratios,
    swara: (degree, octave = 0) => base * 2 ** (octave + Math.floor(degree / 5)) * ratios[((degree % 5) + 5) % 5],
    foreign: (octave = 0) => base * 2 ** octave * foreign,
  }
}

/** Renders one sound, measures it and brings it to its tier. `seed` picks one of the small variations. */
export function prepare(roleId, variantId, params, tuningSpec, sr, seed = 0) {
  const role = ROLE_BY_ID[roleId]
  const variant = role.variants[variantId] ?? role.variants.a
  const rand = random(hash(`${roleId}|${variantId}|${JSON.stringify(params)}|${tuningSpec.raag}|${tuningSpec.sa}|${seed}`))
  const detune = cents((rand() * 2 - 1) * 3)
  const tuning = makeTuning(tuningSpec.raag, tuningSpec.sa)
  const primes = []
  const marks = []
  const record = (f, foreign) => (primes.push({ f, foreign }), f)
  const c = {
    sr,
    rand,
    params,
    S: (degree, octave = 0) => record(tuning.swara(degree, octave) * detune, false),
    F: (octave = 0) => record(tuning.foreign(octave) * detune, true),
    mark: (outcome) => marks.push(outcome),
  }
  const raw = variant.render(c)
  filterInPlace(raw, coefficients("highpass", 180, Math.SQRT1_2, sr))
  filterInPlace(raw, coefficients("highpass", 180, Math.SQRT1_2, sr))
  const data = trimTail(raw, sr)
  const measured = loudness(data, sr)
  const peak = peakOf(data)
  const target = TIERS[role.tier]
  let gain = 10 ** ((target - measured) / 20)
  const peakLimited = peak * gain > PEAK_LIMIT
  if (peakLimited) gain = PEAK_LIMIT / peak
  for (let i = 0; i < data.length; i++) data[i] *= gain
  return { data, primes, marks, tier: role.tier, target, loudness: measured + 20 * Math.log10(gain), peak: peak * gain, peakLimited }
}

/** Unit checks from docs/sound.md ("Tests") over every role, variant and demo case. */
export function runChecks(tuningSpec, sr) {
  const tuning = makeTuning(tuningSpec.raag, tuningSpec.sa)
  const results = []
  for (const role of ROLES) {
    const cases = uniqueParams(role.demo.map(([, params]) => params))
    for (const variantId of Object.keys(role.variants)) {
      for (const params of cases) {
        const sound = prepare(role.id, variantId, params, tuningSpec, sr, 0)
        const band = bandShare(sound.data, sr)
        const issues = []
        for (const { f, foreign } of sound.primes) {
          if (foreign && role.id !== "error") issues.push(`foreign note ${f.toFixed(1)} Hz outside the error role`)
          const off = foreign ? centsFrom(f, tuning.foreign(0)) : centsFromRaag(f, tuning)
          if (Math.abs(off) > 5) issues.push(`${f.toFixed(1)} Hz is ${off.toFixed(1)} cents off`)
        }
        if (Math.abs(sound.loudness - sound.target) > 1) issues.push(`loudness ${sound.loudness.toFixed(1)} dB, tier ${sound.target}${sound.peakLimited ? " (held back by the peak limit)" : ""}`)
        if (sound.primes.some(({ f }) => f < 200)) issues.push("a prime below 200 Hz")
        if (sound.peak > PEAK_LIMIT * 1.001) issues.push(`peak ${(20 * Math.log10(sound.peak)).toFixed(1)} dBFS`)
        if (band.above300 < 0.9) issues.push(`${(band.above300 * 100).toFixed(1)}% of the energy above 300 Hz`)
        if (band.below200 > 0.02) issues.push(`${(band.below200 * 100).toFixed(1)}% of the energy below 200 Hz`)
        if (variantId === role.pick) issues.push(...outcomeIssues(role.outcome, sound.marks))
        results.push({
          role: role.id,
          variant: variantId,
          pick: variantId === role.pick,
          params,
          ok: issues.length === 0,
          issues,
          loudness: sound.loudness,
          peakDb: 20 * Math.log10(sound.peak),
          above300: band.above300,
          below200: band.below200,
          seconds: sound.data.length / sr,
        })
      }
    }
  }
  return results
}

/** One stereo room of 0.6 s: highs die faster than lows, a 5 ms pre-delay. */
export function roomImpulse(sr) {
  const rand = random(7)
  const length = Math.round(0.6 * sr)
  const pre = Math.round(0.005 * sr)
  const lowDecay = 6.91 / 0.45
  const highDecay = 6.91 / 0.25
  return [0, 1].map(() => {
    const data = new Float32Array(length)
    let low = 0
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sr
      const white = rand() * 2 - 1
      low += (white - low) * 0.25
      data[i] = low * Math.exp(-lowDecay * t) + (white - low) * 0.5 * Math.exp(-highDecay * t)
    }
    return data
  })
}

export function describe(roleId, params = {}) {
  if (params.quantity !== undefined) return `qty ${params.quantity}`
  if (params.value !== undefined) return ["250 g", "", "500 g", "1 kg"][params.value] || `value ${params.value}`
  if (params.status) return { making: "MAKING", ready: "READY", done: "DELIVERED", paid: "PAID" }[params.status]
  if (params.action) return params.action
  if (params.start !== undefined) return params.start ? "start" : "stop"
  if (params.in !== undefined) return params.in ? "in" : "out"
  if (params.publish !== undefined) return params.publish ? "publish" : "sent"
  if (params.kind) return params.kind
  if (params.unsure !== undefined) return `field ${params.unsure + 1} unsure`
  if (params.fields) return `${params.fields} fields`
  return roleId
}

function stepStroke(out, c, strike) {
  const quantity = c.params.quantity ?? 1
  if (quantity <= 0) dayan(out, c.sr, 0, "te", c.S(0, 0), 1, c.rand)
  else strike(Math.min(quantity, 10) - 1)
}

function fields(out, c, note, gap = 0.045) {
  const count = c.params.fields ?? 4
  for (let k = 0; k < count; k++) note(at(k * gap, c.sr), 5 - (count - 1) + k, k === c.params.unsure)
}

function statusStamp(out, c, rising) {
  const status = c.params.status ?? "making"
  if (status === "paid") {
    bandStamp(out, c.sr, 0, c.S(0, 1), c.S(0, 2), 0.4, c.rand)
    bandStamp(out, c.sr, at(0.22, c.sr), c.S(0, 1), c.S(0, 2), 1, c.rand)
    return
  }
  const [degree, octave] = rising ? STATUS_DEGREES[status] : [0, 1]
  bandStamp(out, c.sr, 0, c.S(degree, octave), c.S(degree, octave + 1), 1, c.rand)
}

function toggle(out, c, hit) {
  const action = c.params.action ?? "close"
  const opening = action === "open" || action === "resume"
  const [first, second] = opening ? [c.S(0, 2), c.S(3, 2)] : [c.S(3, 2), c.S(0, 2)]
  const repeats = action === "pause" || action === "resume" ? 2 : 1
  for (let r = 0; r < repeats; r++) {
    const start = at(r * 0.12, c.sr)
    hit(start, first, 0.8)
    hit(start + at(0.04, c.sr), second, 1)
  }
}

function katori(out, c, start, degree, octave, force, hand = "free") {
  impact(out, c.sr, start, "steelBowl", c.S(degree, octave), { ring: 0.5, hand, force, rand: c.rand })
  spoon(out, c.sr, start, 0.3 * force, c.rand)
}

/** Every positive outcome ends so: a katori on the lower Pa, then one up on Sa 80 ms later, which rings. */
function positiveEnding(out, c, start, level) {
  c.mark("positive")
  katori(out, c, start, 3, 1, 0.75 * level)
  katori(out, c, start + at(0.08, c.sr), 0, 2, level)
}

/** Every negative outcome has it: the bayan glides down to `landing` and stops. */
function negativeFall(out, c, start, landing, fromCents, time, level = 1) {
  c.mark("negative")
  bayan(out, c.sr, start, landing, level, c.rand, { from: fromCents, to: 0, delay: 0, time })
}

function smallFall(out, c, start, level) {
  const landing = c.S(0, 0)
  negativeFall(out, c, start, landing, 1200 * Math.log2(c.S(1, 0) / landing), 0.15, level)
}

function tinField(out, c, start, degree, unsure) {
  if (unsure) smallFall(out, c, start, 0.6)
  else dayan(out, c.sr, start, "tin", c.S(degree, 0), 1, c.rand)
}

function dha(out, c, start, level, accent = false) {
  dayan(out, c.sr, start, "na", c.S(0, 0), level, c.rand)
  bayan(out, c.sr, start, c.S(3, -1), level * (accent ? 1 : 0.7), c.rand, RISE_TO_DHA)
}

function dayan(out, sr, start, stroke, f, level, rand) {
  const spec = DAYAN[stroke]
  let total = 0
  spec.gains.forEach((gain, i) => {
    const amp = gain * level * jitter(rand, 0.1)
    modeBend(out, sr, start, f * (i + 1) * DAYAN_DETUNE[i], amp, FALL_80_DB / spec.t80[i], (t) => 1 + 0.015 * Math.exp(-t / 0.01))
    total += amp
  })
  exciter(out, sr, start, total * 0.2, rand)
  if (stroke === "te") burst(out, sr, start, { f: 900, q: 1.5, length: 0.012, level: total * 0.6 }, rand)
  if (stroke === "ti") burst(out, sr, start, { f: 1800, q: 1.5, length: 0.01, level: total * 0.5 }, rand)
}

function bayan(out, sr, start, f, level, rand, bend) {
  const body = silence(1, sr)
  const glide = (t) => {
    const pitch = bend ? cents(bend.from + (bend.to - bend.from) * ease((t - bend.delay) / bend.time)) : 1
    return pitch * (1 + 0.01 * Math.exp(-t / 0.01))
  }
  ;[0.3, 1, 0.6, 0.3].forEach((gain, i) => modeBend(body, sr, 0, f * (i + 1) * BAYAN_DETUNE[i], gain * jitter(rand, 0.1), FALL_80_DB / 0.7, glide))
  const drive = Math.tanh(1.3)
  for (let i = 0; i < body.length; i++) body[i] = Math.tanh(body[i] * 1.3) / drive
  mix(out, body, start, level)
  burst(out, sr, start, { f: 500, q: 0.9, length: 0.015, level: level * 0.8 }, rand)
  exciter(out, sr, start, level * 0.4, rand)
}

function ka(out, sr, start, level, rand) {
  burst(out, sr, start, { f: 350, q: 1.5, length: 0.035, level: level * 1.6 }, rand)
  burst(out, sr, start, { f: 1200, q: 1.5, length: 0.025, level: level * 0.7 }, rand)
}

function impact(out, sr, start, material, prime, { force = 1, hand = "free", ring, rand, click = true } = {}) {
  const m = MATERIALS[material]
  const handDecay = typeof hand === "number" ? hand : HAND[hand]
  const contact = m.contact * jitter(rand, 0.15)
  let total = 0
  m.ratios.forEach((ratio, i) => {
    const f = prime * ratio
    if (f >= sr * 0.45) return
    const weight = 1 / (1 + (f * contact) ** 2)
    const amp = m.gains[i] * weight * force * jitter(rand, 0.1)
    let decay = handDecay + Math.PI * m.tanPhi * f
    if (ring) decay = Math.max(decay, 6.91 / ring)
    modeFixed(out, sr, start, f, amp, decay)
    if (m.doublet) modeFixed(out, sr, start, f + m.doublet, amp * 0.6, decay)
    total += amp
  })
  if (click) exciter(out, sr, start, total * 0.2, rand)
}

function snap(out, sr, start, f, rand, force = 1) {
  impact(out, sr, start, "steelPlate", f, { force, hand: 40, rand })
  impact(out, sr, start + at(0.003 * jitter(rand, 0.3), sr), "steelPlate", f, { force: force * 0.3, hand: 60, rand, click: false })
  impact(out, sr, start + at(0.008 * jitter(rand, 0.3), sr), "steelPlate", f, { force: force * 0.12, hand: 80, rand, click: false })
}

function lid(out, sr, start, f, rand, force = 1) {
  impact(out, sr, start, "steelPlate", f, { force, ring: 0.25, rand })
  impact(out, sr, start + at(0.012, sr), "steelPlate", f, { force: force * 0.25, ring: 0.2, rand, click: false })
}

function spoon(out, sr, start, level, rand) {
  burst(out, sr, start, { f: 5000, q: 0.7, length: 0.0004, level }, rand)
}

function exciter(out, sr, start, level, rand) {
  burst(out, sr, start, { f: 3200, q: 1.5, length: 0.005, level }, rand)
}

function bellBurst(out, c, start, strikes, domes = [c.S(3, 2), c.S(4, 2)]) {
  let t = 0
  for (let s = 0; s < strikes; s++) {
    const strikeAt = start + at(t, c.sr)
    const strength = jitter(c.rand, 0.15) * (s >= strikes - 2 ? 0.7 : 1)
    domes.forEach((f, k) => {
      const force = strength * (k === 0 ? 1 : 0.8) * jitter(c.rand, 0.2)
      for (const [ratio, gain] of [
        [1, 1],
        [2.83, 0.4],
        [5.42, 0.15],
      ])
        modeFixed(out, c.sr, strikeAt, f * ratio, gain * force * 0.25, Math.max(Math.PI * 0.001 * f * ratio, 6.91 / 0.5))
    })
    burst(out, c.sr, strikeAt, { f: 6000, q: 0.8, length: 0.002, level: 0.3 * strength }, c.rand)
    t += (1 / 30) * jitter(c.rand, 0.15)
  }
}

function rubberStamp(out, c, start, level) {
  contactSound(out, c, start, level, STAMP)
}

function inkPad(out, c, start, level) {
  contactSound(out, c, start, level, INK_PAD)
}

/**
 * A soft contact, measured from recordings: band-passed noise only, no ringing modes. Each layer is
 * { at: ms, ratio: to the centre swara, q, db, fall: dB per ms, rise: ms, riseDb } and timings vary ±15%.
 */
function contactSound(out, c, start, level, { centre, layers, exciterAt, exciterDb }) {
  const f0 = c.S(...centre)
  for (const layer of layers) {
    const onset = start + at((layer.at / 1000) * jitter(c.rand, 0.15), c.sr)
    burst(
      out,
      c.sr,
      onset,
      {
        f: f0 * layer.ratio,
        q: layer.q,
        length: (FALL_80 / layer.fall / 1000) * jitter(c.rand, 0.15),
        level: level * 10 ** ((layer.db + (c.rand() * 2 - 1)) / 20),
        attack: layer.rise / 1000,
        attackDb: layer.riseDb ?? 0,
      },
      c.rand,
    )
  }
  if (exciterAt !== undefined) exciter(out, c.sr, start + at(exciterAt / 1000, c.sr), level * 10 ** (exciterDb / 20), c.rand)
}

function bandStamp(out, sr, start, low, high, level, rand) {
  burst(out, sr, start, { f: low, q: 8, length: 0.05, level: level * 4 }, rand)
  burst(out, sr, start, { f: high, q: 6, length: 0.03, level: level * 2.5 }, rand)
  burst(out, sr, start, { f: 650, q: 0.9, length: 0.012, level: level * 0.5 }, rand)
  exciter(out, sr, start, level * 0.25, rand)
  burst(out, sr, start + at(0.11, sr), { f: 3200, q: 2, length: 0.004, level: level * 0.15 }, rand)
}

function slipTear(out, sr, start, rand) {
  crackle(out, sr, start, { length: 0.25, rateFrom: 80, rateTo: 250, band: [2000, 6000] }, rand)
  burst(out, sr, start + at(0.27, sr), { f: 1000, q: 0.8, length: 0.03, level: 0.8 }, rand)
}

function carbonSlip(out, sr, start, rand) {
  crackle(out, sr, start, { length: 0.32, rateFrom: 60, rateTo: 180, band: [1800, 5000] }, rand)
  burst(out, sr, start + at(0.34, sr), { f: 800, q: 0.8, length: 0.04, level: 0.9 }, rand)
}

function crumple(out, sr, start, rand) {
  const length = 0.15
  const count = Math.min(out.length - start, Math.ceil((length + 0.03) * sr))
  if (count <= 0) return
  const part = new Float32Array(count)
  crackle(part, sr, 0, { length, rateFrom: 600, band: [1500, 5000] }, rand)
  for (let i = 0; i < count; i++) part[i] *= Math.max(0, 1 - i / (length * sr)) ** 1.5
  mix(out, part, start)
}

function matchstick(out, sr, start, rand) {
  sweep(out, sr, start, { from: 2200, to: 5200, q: 4.5, length: 0.11, level: 1.5 }, rand)
  burst(out, sr, start + at(0.11, sr), { f: 900, q: 0.7, length: 0.075, level: 0.6 }, rand)
}

function santoor(out, sr, start, f, level, rand) {
  const ring = karplusStrong(f, 0.9, 2.5, sr, rand)
  const short = karplusStrong(f, 0.9, 0.83, sr, rand)
  const note = silence(0.95, sr)
  SANTOOR_COURSE.forEach((offset, i) => {
    const string = i === 2 ? short : ring
    mixResampled(note, at(i * 0.0007, sr), string.data, string.rate * cents(offset), 0.32)
  })
  filterInPlace(note, coefficients("peaking", 1800, 1, sr, 4))
  filterInPlace(note, coefficients("lowpass", 6000, 0.7, sr))
  exciter(note, sr, 0, 0.25, rand)
  mix(out, note, start, level)
}

function karplusStrong(f, seconds, t60, sr, rand) {
  const length = Math.max(4, Math.floor(sr / f - 0.5))
  const data = silence(seconds, sr)
  const line = new Float32Array(length)
  const width = Math.max(2, Math.min(length, Math.round(0.0004 * sr)))
  for (let i = 0; i < width; i++) line[i] = Math.sin((Math.PI * i) / width) + (rand() * 2 - 1) * 0.1
  const gap = Math.max(1, Math.round(length / 8))
  for (let i = length - 1; i >= gap; i--) line[i] -= line[i - gap]
  let mean = 0
  for (let i = 0; i < length; i++) mean += line[i] / length
  for (let i = 0; i < length; i++) line[i] -= mean
  const loss = 10 ** (-3 / (f * t60))
  let previous = 0
  let index = 0
  for (let i = 0; i < data.length; i++) {
    const current = line[index]
    line[index] = loss * 0.5 * (current + previous)
    previous = current
    data[i] = current
    index = index + 1 === length ? 0 : index + 1
  }
  return { data, rate: f / (sr / (length + 0.5)) }
}

function breath(out, sr, start, length, f, rand) {
  const count = Math.min(out.length - start, Math.ceil(length * sr))
  if (count <= 0) return
  const air = new Float32Array(count)
  const attack = Math.min(0.12, length / 3)
  for (let i = 0; i < count; i++) {
    const t = i / sr
    const envelope = t < attack ? t / attack : Math.max(0, 1 - (t - attack) / (length - attack)) ** 1.5
    air[i] = (rand() * 2 - 1) * envelope
  }
  filterInPlace(air, coefficients("bandpass", 2500, 1.2, sr))
  mix(out, air, start)
  burst(out, sr, start, { f: 1800, q: 0.8, length: 0.04, level: 0.6 }, rand)
  let phase = 0
  for (let i = 0; i < count; i++) {
    const t = i / sr
    const vibrato = t > 0.15 ? 15 * Math.min(1, (t - 0.15) / 0.2) * Math.sin(TAU * 5.5 * t) : 0
    phase += (TAU * f * cents(vibrato)) / sr
    const envelope = (t < 0.06 ? t / 0.06 : Math.max(0, 1 - (t - 0.06) / (length - 0.06))) * 0.06
    out[start + i] += envelope * (Math.sin(phase) + 0.2 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase))
  }
}

function crackle(out, sr, start, { length, rateFrom, rateTo = rateFrom, band: [low, high], fall = false, level = 1 }, rand) {
  let t = 0
  while (t < length) {
    const progress = t / length
    const centre = fall ? high * (low / high) ** progress : low + (high - low) * rand()
    const energy = Math.min(30, (1 - rand()) ** -2)
    burst(out, sr, start + at(t, sr), { f: centre, q: 1.5, length: 0.001 + rand() * 0.002, level: Math.min(0.7, 0.3 * Math.sqrt(energy)) * level }, rand)
    t += -Math.log(1 - rand()) / (rateFrom + (rateTo - rateFrom) * progress)
  }
}

function sweep(out, sr, start, { from, to, q, length, level, attack = 0.01 }, rand) {
  const count = Math.min(out.length - start, Math.ceil((length + 0.02) * sr))
  const total = Math.ceil(length * sr)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  let k = coefficients("bandpass", from, q, sr)
  for (let i = 0; i < count; i++) {
    if (i % 32 === 0) k = coefficients("bandpass", from * (to / from) ** Math.min(1, i / total), q, sr)
    const envelope = i < total ? level * Math.min(1, i / sr / attack) * (1 - i / total) : 0
    const x = (rand() * 2 - 1) * envelope
    const y = k[0] * x + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    out[start + i] += y
  }
}

/** Band-passed noise that falls 80 dB over `length`. `attack` ramps it in: linearly, or from `attackDb` below in equal dB steps. */
function burst(out, sr, start, { f, q = 1, type = "bandpass", length, level = 1, attack = 0, attackDb = 0 }, rand) {
  const count = Math.min(out.length - start, Math.ceil((length + attack + 0.02) * sr))
  if (count <= 0 || level === 0) return
  const noise = new Float32Array(count)
  const decay = Math.exp(-FALL_80_DB / (length * sr))
  const rise = Math.max(1, Math.round(attack * sr))
  const stop = rise - 1 + Math.ceil(length * sr)
  let envelope = level
  for (let i = 0; i < stop && i < count; i++) {
    const progress = Math.min(1, (i + 1) / rise)
    const shape = attackDb > 0 ? 10 ** ((-attackDb * (1 - progress)) / 20) : progress
    noise[i] = (rand() * 2 - 1) * envelope * shape
    if (i + 1 >= rise) envelope *= decay
  }
  filterInPlace(noise, coefficients(type, f, q, sr))
  mix(out, noise, start)
}

function sine(out, sr, start, f, amp, attack, t60) {
  const decay = Math.exp(-6.91 / (t60 * sr))
  const step = (TAU * f) / sr
  const ramp = Math.max(1, Math.round(attack * sr))
  let envelope = amp
  for (let i = start, n = 0; i < out.length && envelope > 1e-6; i++, n++) {
    out[i] += envelope * Math.min(1, n / ramp) * Math.sin(step * n)
    envelope *= decay
  }
}

/** A damped sine mode by the two-pole resonator recursion: no sine call for each sample. */
function modeFixed(out, sr, start, f, amp, decay) {
  if (f <= 0 || f >= sr * 0.45 || amp === 0 || start >= out.length) return
  const r = Math.exp(-decay / sr)
  const theta = (TAU * f) / sr
  const c1 = 2 * r * Math.cos(theta)
  const c2 = r * r
  let y2 = 0
  let y1 = amp * r * Math.sin(theta)
  let envelope = amp * r
  for (let i = start + 1; i < out.length && envelope > 1e-6; i++) {
    out[i] += y1
    const y = c1 * y1 - c2 * y2
    y2 = y1
    y1 = y
    envelope *= r
  }
}

/** A damped sine whose pitch moves (a skin under the hand): a phase accumulator. */
function modeBend(out, sr, start, f, amp, decay, ratioAt) {
  if (amp === 0 || start >= out.length) return
  const r = Math.exp(-decay / sr)
  let phase = 0
  let envelope = amp
  for (let i = start; i < out.length && envelope > 1e-6; i++) {
    phase += (TAU * f * ratioAt((i - start) / sr)) / sr
    if (f * ratioAt((i - start) / sr) < sr * 0.45) out[i] += envelope * Math.sin(phase)
    envelope *= r
  }
}

function mixResampled(out, start, source, rate, gain) {
  for (let i = start, position = 0; i < out.length; i++, position += rate) {
    const k = Math.floor(position)
    if (k + 1 >= source.length) break
    out[i] += gain * (source[k] + (source[k + 1] - source[k]) * (position - k))
  }
}

function mix(out, source, start, gain = 1) {
  for (let i = 0; i < source.length && start + i < out.length; i++) out[start + i] += source[i] * gain
}

function coefficients(type, f, q, sr, gainDb = 0) {
  const w0 = (TAU * Math.min(f, sr * 0.45)) / sr
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const a = 10 ** (gainDb / 40)
  let b0, b1, b2, a0, a1, a2
  if (type === "lowpass") [b0, b1, b2, a0, a1, a2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha]
  else if (type === "highpass") [b0, b1, b2, a0, a1, a2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha]
  else if (type === "peaking") [b0, b1, b2, a0, a1, a2] = [1 + alpha * a, -2 * cos, 1 - alpha * a, 1 + alpha / a, -2 * cos, 1 - alpha / a]
  else if (type === "highshelf") {
    const s = 2 * Math.sqrt(a) * alpha
    ;[b0, b1, b2] = [a * (a + 1 + (a - 1) * cos + s), -2 * a * (a - 1 + (a + 1) * cos), a * (a + 1 + (a - 1) * cos - s)]
    ;[a0, a1, a2] = [a + 1 - (a - 1) * cos + s, 2 * (a - 1 - (a + 1) * cos), a + 1 - (a - 1) * cos - s]
  } else [b0, b1, b2, a0, a1, a2] = [alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha]
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]
}

function filterInPlace(data, [b0, b1, b2, a1, a2]) {
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < data.length; i++) {
    const x = data[i]
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    data[i] = y
  }
  return data
}

/** K-weighting (its high shelf), a 400 Hz high-pass for the phone, and the loudest 100 ms window. */
function loudness(data, sr) {
  const weighted = Float32Array.from(data)
  filterInPlace(weighted, coefficients("highshelf", 1681, Math.SQRT1_2, sr, 4))
  filterInPlace(weighted, coefficients("highpass", 400, Math.SQRT1_2, sr))
  const window = Math.round(0.1 * sr)
  let sum = 0
  let loudest = 0
  for (let i = 0; i < weighted.length; i++) {
    sum += weighted[i] ** 2
    if (i >= window) sum -= weighted[i - window] ** 2
    loudest = Math.max(loudest, sum / window)
  }
  return loudest > 0 ? -0.691 + 10 * Math.log10(loudest) : -Infinity
}

function bandShare(data, sr) {
  let size = 1
  while (size < data.length) size <<= 1
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  re.set(data)
  fft(re, im)
  let total = 0
  let above300 = 0
  let below200 = 0
  for (let k = 1; k < size / 2; k++) {
    const power = re[k] ** 2 + im[k] ** 2
    const f = (k * sr) / size
    total += power
    if (f >= 300) above300 += power
    if (f < 200) below200 += power
  }
  return { above300: above300 / total, below200: below200 / total }
}

function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = -TAU / length
    const wr = Math.cos(angle)
    const wi = Math.sin(angle)
    for (let i = 0; i < n; i += length) {
      let cr = 1
      let ci = 0
      for (let j = 0; j < length / 2; j++) {
        const ar = re[i + j + length / 2] * cr - im[i + j + length / 2] * ci
        const ai = re[i + j + length / 2] * ci + im[i + j + length / 2] * cr
        re[i + j + length / 2] = re[i + j] - ar
        im[i + j + length / 2] = im[i + j] - ai
        re[i + j] += ar
        im[i + j] += ai
        ;[cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr]
      }
    }
  }
}

function trimTail(data, sr) {
  const peak = peakOf(data)
  let last = data.length - 1
  while (last > 0 && Math.abs(data[last]) < peak * 1e-3) last--
  const end = Math.min(data.length, last + Math.round(0.01 * sr))
  const trimmed = data.slice(0, Math.max(1, end))
  const fade = Math.min(trimmed.length, Math.round(0.01 * sr))
  for (let i = 0; i < fade; i++) trimmed[trimmed.length - 1 - i] *= i / fade
  return trimmed
}

function peakOf(data) {
  let peak = 0
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  return peak
}

function centsFromRaag(f, tuning) {
  const position = (((1200 * Math.log2(f / tuning.base)) % 1200) + 1200) % 1200
  let best = Infinity
  for (const ratio of tuning.ratios) {
    const target = 1200 * Math.log2(ratio)
    for (const shift of [-1200, 0, 1200]) {
      const off = position - (target + shift)
      if (Math.abs(off) < Math.abs(best)) best = off
    }
  }
  return best
}

function outcomeIssues(outcome, marks) {
  const positive = marks.includes("positive")
  const negative = marks.includes("negative")
  if (outcome === "positive") return marks.at(-1) === "positive" && !negative ? [] : ["a positive role ends with the positive ending and has no fall"]
  if (outcome === "negative") return negative && !positive ? [] : ["a negative role has the negative fall and no positive ending"]
  return positive || negative ? ["only positive and negative roles use their endings"] : []
}

function centsFrom(f, reference) {
  const off = (((1200 * Math.log2(f / reference)) % 1200) + 1200) % 1200
  return off > 600 ? off - 1200 : off
}

function uniqueParams(list) {
  const seen = new Map()
  for (const params of list) seen.set(JSON.stringify(params), params)
  return [...seen.values()]
}

function ease(x) {
  const p = Math.min(1, Math.max(0, x))
  return 1 - (1 - p) ** 2
}

function silence(seconds, sr) {
  return new Float32Array(Math.max(1, Math.ceil(seconds * sr)))
}

function at(seconds, sr) {
  return Math.max(0, Math.round(seconds * sr))
}

function cents(value) {
  return 2 ** (value / 1200)
}

function jitter(rand, amount) {
  return 1 + (rand() * 2 - 1) * amount
}

function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}
