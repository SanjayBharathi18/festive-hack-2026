import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cartPartQuerySchema,
  cartReadAnswerSchema,
  cartReadBodySchema,
  deskReadAnswerSchema,
  deskReadBodySchema,
  draftSchema,
  maxParts,
  maxTextLength,
  partAnswerSchema,
  type DeskReadAnswer,
} from "./reading.ts";

const partId = "6f1c2a4e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const otherPart = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const draft: DeskReadAnswer["draft"] = {
  order_id: "3f2e1d0c-9b8a-4766-8554-433221100fed",
  items: [
    {
      item_id: "00000000-0000-4000-8000-000000000001",
      name: "ಕಾಜು ಕಟ್ಲಿ",
      said: "2 kg kaju katli",
      asked: { quantity: 2, unit: "kg", pack_grams: null, pack_pieces: null },
      packs: [
        {
          pack_id: "00000000-0000-4000-8000-000000000002",
          label: "1 kg",
          quantity: 2,
          price: 128_000,
          grams: 1000,
          pieces: null,
        },
      ],
      near_amount: false,
      near_name: false,
      sold_out: false,
    },
  ],
  unmatched: [],
  day: "2026-11-29",
  fulfilment: "delivery",
  buyer_name: "Neha",
  address: "Koramangala",
  note: null,
  total: 256_000,
  capacity: {
    day: "2026-11-29",
    fits: true,
    reason: null,
    space_left: 16_000,
    next_free_day: null,
  },
};

const answer: DeskReadAnswer = {
  transcript: "Sunday ko 2 kg kaju katli",
  translation: null,
  language: "hi-IN",
  path: "ai",
  variant: "native",
  outcome: "ok",
  show_manual: false,
  recorded: true,
  placeholder: false,
  trace: {
    segment: "lang_hi",
    flags_from: "defaults",
    in_experiment: false,
    duration_ms: 12,
    show: false,
  },
  draft,
};

test("a part answer has the words, the language and the length", () => {
  const part = {
    part_id: partId,
    transcript: "ಎರಡು ಕೆಜಿ",
    language: "kn-IN",
    language_probability: 0.9,
    seconds: 12.5,
    recorded: true,
    placeholder: true,
  };
  assert.deepEqual(partAnswerSchema.parse(part), part);
  assert.equal(
    partAnswerSchema.safeParse({ ...part, seconds: 31 }).success,
    false,
  );
  assert.equal(
    partAnswerSchema.safeParse({ ...part, language: "kannada" }).success,
    false,
  );
  assert.equal(
    partAnswerSchema.safeParse({ ...part, seconds: 0.05 }).success,
    false,
  );
  const { placeholder: _, ...unmarked } = part;
  assert.equal(partAnswerSchema.safeParse(unmarked).success, false);
});

test("a desk reading takes parts or text, with an optional language and source", () => {
  assert.deepEqual(
    deskReadBodySchema.parse({ part_ids: [partId, otherPart] }),
    {
      part_ids: [partId, otherPart],
      source: "desk",
    },
  );
  assert.deepEqual(
    deskReadBodySchema.parse({
      text: "  2 kg kaju katli ",
      language: "hi-IN",
      source: "load",
    }),
    { text: "2 kg kaju katli", language: "hi-IN", source: "load" },
  );
  for (const body of [
    {},
    { text: "x", part_ids: [partId] },
    { text: "   " },
    { text: "x".repeat(maxTextLength + 1) },
    { part_ids: [] },
    { part_ids: [partId, partId] },
    {
      part_ids: Array.from({ length: maxParts + 1 }, () => crypto.randomUUID()),
    },
    { part_ids: ["not-a-uuid"] },
    { text: "x", language: "kn" },
    { text: "x", language: "zz-IN" },
    { text: "x", language: "xyz-IN" },
    { text: "x", source: "link" },
  ]) {
    assert.equal(
      deskReadBodySchema.safeParse(body).success,
      false,
      JSON.stringify(body).slice(0, 60),
    );
  }
});

test("a cart reading takes the store slug and the parts", () => {
  assert.deepEqual(
    cartReadBodySchema.parse({
      store: "shobhas-kitchen",
      part_ids: [partId],
      via: "market",
    }),
    { store: "shobhas-kitchen", part_ids: [partId], via: "market" },
  );
  assert.equal(
    cartReadBodySchema.safeParse({ store: "Shobha's", part_ids: [partId] })
      .success,
    false,
  );
  assert.equal(
    cartReadBodySchema.safeParse({ store: "shobhas-kitchen", text: "x" })
      .success,
    false,
  );
  assert.deepEqual(cartPartQuerySchema.parse({ store: "test-kitchen" }), {
    store: "test-kitchen",
  });
  assert.equal(cartPartQuerySchema.safeParse({}).success, false);
});

test("a draft has its order id, items, day, buyer and capacity", () => {
  assert.deepEqual(draftSchema.parse(draft), draft);
  assert.equal(
    draftSchema.safeParse({ ...draft, order_id: "1" }).success,
    false,
  );
  const noPacks = { ...draft, items: [{ ...draft.items[0], packs: [] }] };
  assert.equal(draftSchema.safeParse(noPacks).success, false);
});

test("a desk answer and a cart answer have the reading and its trace", () => {
  assert.deepEqual(deskReadAnswerSchema.parse(answer), answer);
  assert.equal(
    deskReadAnswerSchema.safeParse({ ...answer, variant: "none" }).success,
    false,
  );
  const { draft: _, translation: __, ...fields } = answer;
  const cart = {
    ...fields,
    cart: { items: draft.items, unmatched: [], day: null, total: 256_000 },
  };
  assert.deepEqual(cartReadAnswerSchema.parse(cart), cart);
  assert.equal(
    cartReadAnswerSchema.safeParse({ ...cart, outcome: "broken" }).success,
    false,
  );
});

test("a reading accepts only the languages that Sarvam supports", () => {
  for (const language of ["kn-IN", "hi-IN", "en-IN", "brx-IN", "sat-IN"]) {
    assert.equal(
      deskReadBodySchema.parse({ text: "x", language }).language,
      language,
    );
  }
  for (const language of ["zz-IN", "abc-IN", "en-US", "KN-IN"]) {
    assert.equal(
      deskReadBodySchema.safeParse({ text: "x", language }).success,
      false,
      language,
    );
  }
});

test("an answer says whether a placeholder answer was used", () => {
  const { placeholder: _, ...unmarked } = answer;
  assert.equal(deskReadAnswerSchema.safeParse(unmarked).success, false);
  assert.equal(
    deskReadAnswerSchema.parse({ ...answer, placeholder: true }).placeholder,
    true,
  );
});
