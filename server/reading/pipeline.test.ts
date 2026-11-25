import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cartReadAnswerSchema,
  deskReadAnswerSchema,
  readOutcomeSchema,
  readPathSchema,
  readVariantSchema,
} from "../../shared/reading.ts";
import {
  experimentPathSchema,
  readingPathSchema,
  safeSarvam,
  type FlagValues,
  type Flags,
  type OrderTraits,
} from "../flags/decisions.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import { createMetrics, outcomes } from "../metrics/metrics.ts";
import type { SarvamAnswer, SarvamApi, SarvamRequest } from "../sarvam/api.ts";
import { counterValue } from "../sarvam/fake-sarvam.ts";
import { translateLimit } from "../sarvam/translate.ts";
import { createTestClock } from "../test-app.ts";
import {
  cartAnswer,
  countsForExperiment,
  deskAnswer,
  readOrder,
  readVariant,
  type ReadRequest,
} from "./pipeline.ts";
import type { Reading } from "./prompt.ts";
import { heroMenu, menu } from "./test-menu.ts";

type Handler = (request: SarvamRequest) => SarvamAnswer;

const kajuKatli: Reading = {
  items: [
    {
      menu_name: "Kaju katli",
      said: "2 kg kaju katli",
      quantity: 2,
      unit: "kg",
      pack_grams: null,
      pack_pieces: null,
    },
  ],
  day: "sunday",
  date: null,
  buyer_name: "Neha",
  fulfilment: "delivery",
  address: "Koramangala",
  note: null,
};

function ok(body: unknown): SarvamAnswer {
  return { ok: true, status: 200, body, placeholder: false };
}

function chatBody(content: string, finish = "stop") {
  return {
    choices: [{ finish_reason: finish, message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

const answers: Record<SarvamApi, Handler> = {
  chat: () => ok(chatBody(JSON.stringify(kajuKatli))),
  translate: (request) =>
    ok({ translated_text: `EN(${String(request.input).length})` }),
  language_id: () => ok({ language_code: "hi-IN" }),
  speech_to_text: () => ok({ transcript: "" }),
  transliterate: () => ok({ transliterated_text: "" }),
};

function setup({
  flags: values = {},
  inExperiment = false,
  handlers = {},
}: {
  flags?: Partial<FlagValues>;
  inExperiment?: boolean;
  handlers?: Partial<Record<SarvamApi, Handler>>;
} = {}) {
  const requests: SarvamRequest[] = [];
  const traits: { orderId: string; traits: OrderTraits }[] = [];
  const base = createDefaultFlags(values);
  const flags: Flags = {
    ...base,
    forOrder: async (orderId, orderTraits) => {
      traits.push({ orderId, traits: orderTraits });
      return {
        ...(await base.forOrder(orderId, orderTraits)),
        in_experiment: inExperiment,
      };
    },
  };
  const metrics = createMetrics();
  const deps = {
    sarvam: {
      mode: "live" as const,
      send: async (request: SarvamRequest) => {
        requests.push(request);
        return (handlers[request.api] ?? answers[request.api])(request);
      },
    },
    metrics,
    flags,
    clock: createTestClock(),
  };
  return {
    deps,
    requests,
    traits,
    exposures: base.exposures,
    metrics,
    apis: () => requests.map(({ api }) => api),
  };
}

function request(extra: Partial<ReadRequest> = {}): ReadRequest {
  return {
    kind: "desk",
    store: { slug: "test-kitchen", is_demo: false },
    menu,
    source: "desk",
    heard: {
      transcript: "Hi aunty, Sunday ko 2 kg kaju katli chahiye",
      language: "hi-IN",
      placeholder: false,
    },
    identify: false,
    ...extra,
  };
}

test("the ai path reads natively, with the settings of cfg_sarvam", async () => {
  const cfg = {
    ...safeSarvam,
    reasoning_effort: "low" as const,
    max_tokens: 2048,
  };
  const { deps, requests, metrics } = setup({ flags: { cfg_sarvam: cfg } });
  const result = await readOrder(deps, request());
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.api, "chat");
  assert.equal(requests[0]?.input, request().heard.transcript);
  assert.deepEqual(requests[0]?.settings, {
    reasoning_effort: "low",
    max_tokens: 2048,
  });
  assert.equal(result.path, "ai");
  assert.equal(result.variant, "native");
  assert.equal(result.outcome, "ok");
  assert.equal(result.show_manual, false);
  assert.equal(result.recorded, false);
  assert.equal(result.translation, null);
  assert.equal(result.draft.items[0]?.item_id, heroMenu.kajuKatli.id);
  assert.equal(result.draft.items[0]?.packs[0]?.quantity, 2);
  assert.equal(result.draft.day, "2026-11-29");
  assert.deepEqual(result.trace, {
    segment: "lang_hi",
    flags_from: "defaults",
    in_experiment: false,
    duration_ms: result.trace.duration_ms,
    show: false,
  });
  assert.equal(
    await counterValue(metrics.readingResults, {
      language: "hi-IN",
      variant: "native",
      path: "ai",
      outcome: "ok",
    }),
    1,
  );
});

test("translate_first changes the transcript to English, then reads the English", async () => {
  const { deps, requests } = setup({
    flags: { exp_reading_path: "translate_first" },
  });
  const result = await readOrder(deps, request());
  assert.deepEqual(
    requests.map(({ api, model }) => `${api} ${model}`),
    ["translate mayura:v1", "chat sarvam-105b"],
  );
  const translated = `EN(${request().heard.transcript.length})`;
  assert.equal(requests[1]?.input, translated);
  assert.equal(result.translation, translated);
  assert.equal(result.transcript, request().heard.transcript);
  assert.equal(result.variant, "translate_first");
});

test("an en-IN transcript needs no translation", async () => {
  const { deps, apis } = setup({
    flags: { exp_reading_path: "translate_first" },
  });
  const result = await readOrder(
    deps,
    request({
      heard: {
        transcript: "2 kg kaju katli",
        language: "en-IN",
        placeholder: false,
      },
    }),
  );
  assert.deepEqual(apis(), ["chat"]);
  assert.equal(result.translation, null);
  assert.equal(result.variant, "translate_first");
});

test("translate-first splits a long transcript at sentence ends, 1,000 characters at most", async () => {
  const sentence = `${"ಚಕ್ಕುಲಿ ಬೇಕು ".repeat(25).trim()}.`;
  const transcript = Array.from({ length: 8 }, () => sentence).join(" ");
  const { deps, requests } = setup({
    flags: { exp_reading_path: "translate_first" },
  });
  const result = await readOrder(
    deps,
    request({ heard: { transcript, language: "kn-IN", placeholder: false } }),
  );
  const chunks = requests
    .filter(({ api }) => api === "translate")
    .map(({ input }) => String(input));
  assert.ok(chunks.length >= 3);
  assert.ok(
    chunks.every(
      (chunk) => chunk.length <= translateLimit && chunk.endsWith("."),
    ),
  );
  assert.equal(chunks.join(" "), transcript);
  assert.equal(
    requests.at(-1)?.input,
    chunks.map((chunk) => `EN(${chunk.length})`).join(" "),
  );
  assert.equal(result.outcome, "ok");
});

test("safe uses the fixed known-good setting and the native path", async () => {
  const { deps, requests } = setup({
    flags: {
      ops_reading: "safe",
      exp_reading_path: "translate_first",
      cfg_sarvam: { ...safeSarvam, reasoning_effort: "high", max_tokens: 4096 },
    },
  });
  const result = await readOrder(deps, request());
  assert.deepEqual(
    requests.map(({ api, model, settings }) => ({ api, model, settings })),
    [
      {
        api: "chat",
        model: "sarvam-105b",
        settings: { reasoning_effort: null, max_tokens: 1024 },
      },
    ],
  );
  assert.equal(result.path, "safe");
  assert.equal(result.variant, "native");
  assert.equal(result.show_manual, false);
});

test("manual reads nothing: the answer has the transcript and an empty draft", async () => {
  const { deps, requests, metrics } = setup({
    flags: { ops_reading: "manual" },
  });
  const result = await readOrder(deps, request());
  assert.equal(requests.length, 0);
  assert.equal(result.path, "manual");
  assert.equal(result.variant, null);
  assert.equal(result.outcome, "ok");
  assert.equal(result.show_manual, true);
  assert.equal(result.transcript, request().heard.transcript);
  assert.deepEqual(result.draft.items, []);
  assert.equal(result.draft.capacity, null);
  assert.equal(
    await counterValue(metrics.readingResults, {
      path: "manual",
      variant: "none",
    }),
    1,
  );
});

test("a cut-off answer or an empty answer is invalid, and the page shows the manual path", async () => {
  for (const body of [
    chatBody("", "length"),
    chatBody(""),
    chatBody("not json"),
  ]) {
    const { deps, metrics } = setup({ handlers: { chat: () => ok(body) } });
    const result = await readOrder(deps, request());
    assert.equal(result.outcome, "invalid");
    assert.equal(result.show_manual, true);
    assert.deepEqual(result.draft.items, []);
    assert.equal(
      await counterValue(metrics.readingResults, {
        language: "hi-IN",
        path: "ai",
        outcome: "invalid",
      }),
      1,
    );
  }
});

test("a failed call gives its outcome, and the page shows the manual path", async () => {
  for (const outcome of [
    "rate_limited",
    "no_credit",
    "error",
    "timeout",
  ] as const) {
    const { deps } = setup({
      handlers: {
        chat: () => ({
          ok: false,
          outcome,
          status: null,
          code: null,
          missing: false,
        }),
      },
    });
    const result = await readOrder(deps, request());
    assert.equal(result.outcome, outcome);
    assert.equal(result.show_manual, true);
  }
});

test("a failed translation gives its outcome, with no reading", async () => {
  const { deps, apis } = setup({
    flags: { exp_reading_path: "translate_first" },
    handlers: {
      translate: () => ({
        ok: false,
        outcome: "timeout",
        status: null,
        code: null,
        missing: false,
      }),
    },
  });
  const result = await readOrder(deps, request());
  assert.deepEqual(apis(), ["translate"]);
  assert.equal(result.outcome, "timeout");
  assert.equal(result.show_manual, true);
});

test("a text order with no language is identified first, and a known language skips that", async () => {
  const unknown = setup();
  const identified = await readOrder(
    unknown.deps,
    request({
      heard: {
        transcript: "2 kg kaju katli",
        language: null,
        placeholder: false,
      },
      identify: true,
    }),
  );
  assert.deepEqual(unknown.apis(), ["language_id", "chat"]);
  assert.equal(identified.language, "hi-IN");
  assert.equal(unknown.traits[0]?.traits.language, "hi-IN");
  const known = setup();
  await readOrder(known.deps, request({ identify: true }));
  assert.deepEqual(known.apis(), ["chat"]);
});

test("when language identification fails, the default flags apply with no language", async () => {
  const { deps, traits } = setup({
    handlers: {
      language_id: () => ({
        ok: false,
        outcome: "error",
        status: 500,
        code: null,
        missing: false,
      }),
    },
  });
  const result = await readOrder(
    deps,
    request({
      heard: {
        transcript: "2 kg kaju katli",
        language: null,
        placeholder: false,
      },
      identify: true,
    }),
  );
  assert.equal(result.language, null);
  assert.equal(traits[0]?.traits.language, undefined);
  assert.equal(result.trace.segment, null);
  assert.equal(result.outcome, "ok");
});

test("the flags for the order use a new order id and the store, source, language and demo traits", async () => {
  const { deps, traits } = setup();
  const result = await readOrder(
    deps,
    request({ store: { slug: "shobhas-kitchen", is_demo: true } }),
  );
  assert.match(result.order_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/);
  assert.deepEqual(traits, [
    {
      orderId: result.order_id,
      traits: {
        store: "shobhas-kitchen",
        source: "desk",
        language: "hi-IN",
        is_demo: true,
      },
    },
  ]);
  assert.equal(result.decision.identity, `order:${result.order_id}`);
});

test("only a desk reading on the ai path, not from load, in the experiment, records an exposure", async () => {
  const cases: [
    string,
    Parameters<typeof setup>[0],
    Partial<ReadRequest>,
    boolean,
  ][] = [
    ["desk, ai, in the experiment", { inExperiment: true }, {}, true],
    ["source load", { inExperiment: true }, { source: "load" }, false],
    ["a cart", { inExperiment: true }, { kind: "cart", source: "link" }, false],
    ["safe", { inExperiment: true, flags: { ops_reading: "safe" } }, {}, false],
    [
      "manual",
      { inExperiment: true, flags: { ops_reading: "manual" } },
      {},
      false,
    ],
    ["not in the experiment", { inExperiment: false }, {}, false],
  ];
  for (const [name, options, extra, expected] of cases) {
    const { deps, exposures } = setup(options);
    const result = await readOrder(deps, request(extra));
    assert.deepEqual(
      exposures,
      expected ? [`order:${result.order_id}`] : [],
      name,
    );
    assert.equal(result.trace.in_experiment, expected, name);
  }
});

test("a cart reading uses the native path, also when the order would get translate_first", async () => {
  const { deps, apis } = setup({
    flags: { exp_reading_path: "translate_first" },
  });
  const result = await readOrder(
    deps,
    request({ kind: "cart", source: "marketplace" }),
  );
  assert.deepEqual(apis(), ["chat"]);
  assert.equal(result.variant, "native");
});

test("the daily limit is checked for the day of the draft", async () => {
  const { deps } = setup();
  const checked: string[] = [];
  const result = await readOrder(
    deps,
    request({
      checkDay: (day, items) => {
        checked.push(`${day} ${items.length}`);
        return {
          day,
          fits: false,
          reason: "full",
          space_left: 0,
          next_free_day: "2026-11-30",
        };
      },
    }),
  );
  assert.deepEqual(checked, ["2026-11-29 1"]);
  assert.equal(result.draft.capacity?.next_free_day, "2026-11-30");
  const noDay = setup({
    handlers: {
      chat: () => ok(chatBody(JSON.stringify({ ...kajuKatli, day: "none" }))),
    },
  });
  const undated = await readOrder(
    noDay.deps,
    request({
      checkDay: () => {
        throw new Error("There is no day to check.");
      },
    }),
  );
  assert.equal(undated.draft.capacity, null);
});

test("the desk and cart answers match their schemas", async () => {
  const { deps } = setup();
  const result = await readOrder(deps, request());
  const desk = deskReadAnswerSchema.parse(deskAnswer(result));
  assert.equal(desk.draft.order_id, result.order_id);
  const cart = cartReadAnswerSchema.parse(cartAnswer(result));
  assert.equal(cart.cart.items.length, 1);
  assert.equal("order_id" in cart.cart, false);
});

test("the variant and the experiment rules are pure functions of the decision", () => {
  assert.equal(
    readVariant(
      { kind: "desk", source: "desk" },
      { ops_reading: "ai", exp_reading_path: "translate_first" },
    ),
    "translate_first",
  );
  assert.equal(
    readVariant(
      { kind: "cart", source: "link" },
      { ops_reading: "ai", exp_reading_path: "translate_first" },
    ),
    "native",
  );
  assert.equal(
    readVariant(
      { kind: "desk", source: "desk" },
      { ops_reading: "safe", exp_reading_path: "translate_first" },
    ),
    "native",
  );
  assert.equal(
    readVariant(
      { kind: "desk", source: "load" },
      { ops_reading: "ai", exp_reading_path: "translate_first" },
    ),
    "native",
  );
  assert.equal(
    readVariant(
      { kind: "desk", source: "desk" },
      { ops_reading: "manual", exp_reading_path: "native" },
    ),
    null,
  );
  assert.equal(
    countsForExperiment(
      { kind: "desk", source: "desk" },
      { ops_reading: "ai", in_experiment: true },
    ),
    true,
  );
  assert.equal(
    countsForExperiment(
      { kind: "desk", source: "load" },
      { ops_reading: "ai", in_experiment: true },
    ),
    false,
  );
});

test("the shared answer values match the flag values and the metric outcomes", () => {
  assert.deepEqual(readPathSchema.options, readingPathSchema.options);
  assert.deepEqual(readVariantSchema.options, experimentPathSchema.options);
  assert.deepEqual(readOutcomeSchema.options, [...outcomes]);
});

test("a load reading uses only the reading step, also when the order would get translate_first", async () => {
  const { deps, apis } = setup({
    flags: { exp_reading_path: "translate_first" },
  });
  const result = await readOrder(deps, request({ source: "load" }));
  assert.deepEqual(apis(), ["chat"]);
  assert.equal(result.variant, "native");
});

test("the answer says when any answer that it used was a placeholder", async () => {
  const placeholder = (body: unknown): SarvamAnswer => ({
    ok: true,
    status: 200,
    body,
    placeholder: true,
  });
  const cases: [string, Parameters<typeof setup>[0], Partial<ReadRequest>][] = [
    [
      "reading",
      {
        handlers: {
          chat: () => placeholder(chatBody(JSON.stringify(kajuKatli))),
        },
      },
      {},
    ],
    [
      "language",
      {
        handlers: {
          language_id: () => placeholder({ language_code: "hi-IN" }),
        },
      },
      {
        heard: {
          transcript: "2 kg kaju katli",
          language: null,
          placeholder: false,
        },
        identify: true,
      },
    ],
    [
      "translation",
      {
        flags: { exp_reading_path: "translate_first" },
        handlers: {
          translate: () => placeholder({ translated_text: "2 kg kaju katli" }),
        },
      },
      {},
    ],
    ["voice part", {}, { heard: { ...request().heard, placeholder: true } }],
  ];
  for (const [name, options, extra] of cases) {
    const { deps } = setup(options);
    assert.equal(
      (await readOrder(deps, request(extra))).placeholder,
      true,
      name,
    );
  }
  const { deps } = setup();
  assert.equal((await readOrder(deps, request())).placeholder, false);
});
