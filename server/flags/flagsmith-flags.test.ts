import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Log } from "../log.ts";
import {
  flagDefaults,
  safeSarvam,
  type CfgSarvam,
  type OrderTraits,
} from "./decisions.ts";
import { createFlags, environmentRefreshMs } from "./flagsmith-flags.ts";

type Answer = Response | Promise<Response>;
type Route = (request: { body: unknown; signal: AbortSignal }) => Answer;
type Call = {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
  signal: AbortSignal;
};
type ApiFlag = {
  name: string;
  enabled: boolean;
  value?: string | number | boolean | null;
  variant?: string;
  experiment?: { id: number; name: string; in_experiment: boolean };
};

const key = "ser.environment_key_secret_value";
const flagsUrl = "https://edge.api.flagsmith.com/api/v1/flags/";
const identitiesUrl = "https://edge.api.flagsmith.com/api/v1/identities/";
const eventsUrl = "https://events.api.flagsmith.com/v1/events";
const traits: OrderTraits = {
  store: "test-kitchen",
  source: "desk",
  language: "kn-IN",
  is_demo: false,
};
const reasoning: CfgSarvam = {
  ...safeSarvam,
  reasoning_effort: "medium",
  max_tokens: 256,
};

function setup(
  t: TestContext,
  routes: Record<string, Route>,
  options: { apiUrl?: string; timeoutMs?: number } = {},
) {
  const calls: Call[] = [];
  const lines: Record<string, unknown>[] = [];
  let now = 0;
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const signal = init?.signal ?? new AbortController().signal;
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body,
      signal,
    });
    const route = routes[url];
    if (route === undefined) throw new TypeError("fetch failed");
    return route({ body, signal });
  }) as typeof fetch;
  const log: Log = (fields) => void lines.push(fields);
  const flags = createFlags(
    { FLAGSMITH_ENVIRONMENT_KEY: key, FLAGSMITH_API_URL: options.apiUrl },
    {
      log,
      clock: { now: () => now },
      fetch: send,
      timeoutMs: options.timeoutMs ?? 1000,
    },
  );
  const keepAlive = setInterval(() => {}, 10);
  t.after(async () => {
    await flags.close(0);
    clearInterval(keepAlive);
  });
  return {
    flags,
    calls,
    lines,
    advance: (ms: number) => {
      now += ms;
    },
    callsTo: (url: string) => calls.filter((call) => call.url === url),
    problems: () =>
      lines.filter(
        (line) =>
          line.msg === "flag value is not valid, so its default applies",
      ),
  };
}

function answer(flags: ApiFlag[]): Response {
  return Response.json(flags.map(apiFlag));
}

function identityAnswer(flags: ApiFlag[]): Response {
  return Response.json({ traits: [], flags: flags.map(apiFlag) });
}

function apiFlag(flag: ApiFlag, index: number) {
  return {
    id: index + 1,
    feature: {
      id: index + 100,
      name: flag.name,
      type: flag.variant === undefined ? "STANDARD" : "MULTIVARIATE",
    },
    feature_state_value: flag.value ?? null,
    enabled: flag.enabled,
    environment: 1,
    identity: null,
    feature_segment: null,
    ...(flag.variant === undefined ? {} : { variant: flag.variant }),
    ...(flag.experiment === undefined
      ? {}
      : { metadata: { experiment: flag.experiment } }),
  };
}

function hang(signal: AbortSignal): Promise<Response> {
  return new Promise((_, reject) =>
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    }),
  );
}

function experimentFlag(overrides: Partial<ApiFlag> = {}): ApiFlag {
  return {
    name: "exp_reading_path",
    enabled: true,
    value: "translate_first",
    variant: "translate_first",
    experiment: { id: 167, name: "Reading path", in_experiment: true },
    ...overrides,
  };
}

test("without an environment key, the defaults in code apply and nothing is called", async () => {
  const calls: unknown[] = [];
  const lines: Record<string, unknown>[] = [];
  const flags = createFlags(
    { FLAGSMITH_ENVIRONMENT_KEY: undefined, FLAGSMITH_API_URL: undefined },
    {
      log: (fields) => void lines.push(fields),
      clock: { now: () => 0 },
      fetch: (async () => {
        calls.push(1);
        throw new Error("No call is expected.");
      }) as typeof fetch,
    },
  );
  assert.deepEqual(await flags.environment(), flagDefaults);
  const decision = await flags.forOrder("abc", traits);
  assert.equal(decision.from, "defaults");
  assert.equal(decision.segment, "lang_kn");
  assert.equal(calls.length, 0);
  assert.deepEqual(lines, [
    {
      msg: "flag source",
      source: "defaults",
      reason: "FLAGSMITH_ENVIRONMENT_KEY is not set",
    },
  ]);
});

test("environment flags: on/off flags read the state, the others read the value", async (t) => {
  const { flags, callsTo, problems } = setup(t, {
    [flagsUrl]: () =>
      answer([
        { name: "ops_voice", enabled: false, value: "ai" },
        { name: "ops_reading", enabled: false, value: "safe" },
        { name: "ops_suggestions", enabled: true, value: "off" },
        { name: "ops_search", enabled: true, value: "plain" },
        { name: "ops_transliteration", enabled: true, value: "off" },
        { name: "ops_translation", enabled: true, value: "off" },
        { name: "ops_review_check", enabled: true, value: "wordlist" },
        { name: "exp_reading_path", enabled: true, value: "translate_first" },
        {
          name: "cfg_sarvam",
          enabled: false,
          value: JSON.stringify(reasoning),
        },
        { name: "cfg_demo_trace", enabled: true, value: null },
      ]),
  });
  assert.deepEqual(await flags.environment(), {
    ops_voice: false,
    ops_reading: "safe",
    ops_suggestions: "off",
    ops_search: "plain",
    ops_transliteration: "off",
    ops_translation: "off",
    ops_review_check: "wordlist",
    exp_reading_path: "translate_first",
    cfg_sarvam: reasoning,
    cfg_demo_trace: true,
  });
  const [call] = callsTo(flagsUrl);
  assert.equal(call?.method, "GET");
  assert.equal(call?.headers.get("X-Environment-Key"), key);
  assert.deepEqual(problems(), []);
});

test("a flag missing from the answer gives its default, and an experiment flag that is off gives native", async (t) => {
  const { flags } = setup(t, {
    [flagsUrl]: () =>
      answer([
        { name: "ops_search", enabled: true, value: "plain" },
        { name: "exp_reading_path", enabled: false, value: "translate_first" },
      ]),
  });
  assert.deepEqual(await flags.environment(), {
    ...flagDefaults,
    ops_search: "plain",
  });
});

test("an invalid value gives its default, and the log names the flag but holds no key", async (t) => {
  const { flags, problems, lines } = setup(t, {
    [flagsUrl]: () =>
      answer([
        { name: "ops_reading", enabled: true, value: "Safe" },
        { name: "ops_search", enabled: true, value: 42 },
        { name: "exp_reading_path", enabled: true, value: "translate-first" },
        {
          name: "cfg_sarvam",
          enabled: true,
          value: JSON.stringify({ ...reasoning, max_tokens: 99_999 }),
        },
        { name: "cfg_demo_trace", enabled: true },
      ]),
  });
  assert.deepEqual(await flags.environment(), {
    ...flagDefaults,
    cfg_demo_trace: true,
  });
  assert.deepEqual(
    problems().map((line) => line.flag),
    ["ops_reading", "ops_search", "exp_reading_path", "cfg_sarvam"],
  );
  assert.match(String(problems()[3]?.problem), /max_tokens/);
  assert.ok(lines.every((line) => !JSON.stringify(line).includes(key)));
});

test("cfg_sarvam is a JSON string of 20,000 bytes at most, else the safe setting applies", async (t) => {
  const tooLong = JSON.stringify({
    ...reasoning,
    speech_model: "ಕ".repeat(6700),
  });
  assert.ok(tooLong.length < 20_000);
  assert.ok(Buffer.byteLength(tooLong) > 20_000);
  const values = [JSON.stringify(reasoning), "{", 12, tooLong];
  const { flags, advance, problems } = setup(t, {
    [flagsUrl]: () =>
      answer([{ name: "cfg_sarvam", enabled: true, value: values.shift() }]),
  });
  assert.deepEqual((await flags.environment()).cfg_sarvam, reasoning);
  for (const problem of [
    "is not valid JSON",
    "is not a JSON string",
    "is over 20000 bytes",
  ]) {
    advance(environmentRefreshMs);
    assert.deepEqual((await flags.environment()).cfg_sarvam, safeSarvam);
    assert.equal(problems().at(-1)?.problem, problem);
  }
});

test("an aborted caller stops waiting for the shared refresh, which goes on for the other callers", async (t) => {
  const gate = Promise.withResolvers<Response>();
  const { flags, callsTo } = setup(t, { [flagsUrl]: () => gate.promise });
  const caller = new AbortController();
  const aborted = flags.environment(caller.signal);
  const waiting = flags.environment();
  caller.abort();
  assert.deepEqual(await aborted, flagDefaults);
  gate.resolve(answer([{ name: "ops_search", enabled: true, value: "plain" }]));
  assert.equal((await waiting).ops_search, "plain");
  assert.equal(callsTo(flagsUrl).length, 1);
  const late = await flags.environment(AbortSignal.abort());
  assert.equal(late.ops_search, "plain");
  assert.equal(callsTo(flagsUrl).length, 1);
});

test("environment flags are fetched at most once each 60 s, and concurrent calls share one fetch", async (t) => {
  let voice = true;
  const { flags, advance, callsTo } = setup(t, {
    [flagsUrl]: () => answer([{ name: "ops_voice", enabled: voice }]),
  });
  const [first, second] = await Promise.all([
    flags.environment(),
    flags.environment(),
  ]);
  assert.equal(first.ops_voice, true);
  assert.equal(second, first);
  assert.equal(callsTo(flagsUrl).length, 1);
  voice = false;
  advance(environmentRefreshMs - 1);
  assert.equal((await flags.environment()).ops_voice, true);
  assert.equal(callsTo(flagsUrl).length, 1);
  advance(1);
  assert.equal((await flags.environment()).ops_voice, false);
  assert.equal(callsTo(flagsUrl).length, 2);
});

test("a timeout gives the defaults, and a later error keeps the last good values", async (t) => {
  const answers: Route[] = [
    ({ signal }) => hang(signal),
    () => answer([{ name: "ops_search", enabled: true, value: "plain" }]),
    () => new Response("down", { status: 500 }),
  ];
  const { flags, advance, callsTo, lines } = setup(
    t,
    { [flagsUrl]: (request) => answers.shift()!(request) },
    { timeoutMs: 20 },
  );
  assert.deepEqual(await flags.environment(), flagDefaults);
  assert.ok(
    lines.some(
      (line) => line.msg === "flagsmith" && /Timeout/.test(String(line.error)),
    ),
  );
  advance(environmentRefreshMs);
  assert.equal((await flags.environment()).ops_search, "plain");
  advance(environmentRefreshMs);
  assert.equal((await flags.environment()).ops_search, "plain");
  assert.equal(callsTo(flagsUrl).length, 3);
  advance(1000);
  await flags.environment();
  assert.equal(callsTo(flagsUrl).length, 3);
});

test("identity flags: one remote request with all traits, and the decision for the order", async (t) => {
  const { flags, callsTo, problems } = setup(t, {
    [identitiesUrl]: () =>
      identityAnswer([
        { name: "ops_reading", enabled: true, value: "safe" },
        {
          name: "cfg_sarvam",
          enabled: true,
          value: JSON.stringify(reasoning),
        },
        experimentFlag(),
        { name: "cfg_demo_trace", enabled: true },
      ]),
  });
  assert.deepEqual(await flags.forOrder("abc", traits), {
    identity: "order:abc",
    ops_reading: "safe",
    cfg_sarvam: reasoning,
    exp_reading_path: "translate_first",
    in_experiment: true,
    experiment: { id: 167, variant: "translate_first" },
    cfg_demo_trace: true,
    segment: "lang_kn",
    from: "flagsmith",
  });
  const [call] = callsTo(identitiesUrl);
  assert.equal(call?.method, "POST");
  assert.equal(call?.headers.get("X-Environment-Key"), key);
  assert.deepEqual(call?.body, {
    identifier: "order:abc",
    traits: [
      { trait_key: "store", trait_value: "test-kitchen" },
      { trait_key: "source", trait_value: "desk" },
      { trait_key: "language", trait_value: "kn-IN" },
      { trait_key: "is_demo", trait_value: false },
    ],
  });
  assert.deepEqual(problems(), []);
});

test("an order with no language sends the language trait as null and has no segment", async (t) => {
  const { flags, callsTo } = setup(t, {
    [identitiesUrl]: () =>
      identityAnswer([{ name: "ops_reading", enabled: true, value: "ai" }]),
  });
  const decision = await flags.forOrder("abc", {
    ...traits,
    language: undefined,
  });
  assert.equal(decision.segment, null);
  assert.equal(decision.from, "flagsmith");
  const body = callsTo(identitiesUrl)[0]?.body as {
    traits: { trait_key: string; trait_value: unknown }[];
  };
  assert.deepEqual(
    body.traits.find(({ trait_key }) => trait_key === "language"),
    { trait_key: "language", trait_value: null },
  );
});

test("an order is in the experiment only if the flag is on, the identity is in the rollout, and the variant key matches the value", async (t) => {
  const cases: [Partial<ApiFlag>, string, boolean][] = [
    [{}, "translate_first", true],
    [{ value: "native", variant: "control" }, "native", true],
    [
      {
        experiment: { id: 167, name: "Reading path", in_experiment: false },
      },
      "translate_first",
      false,
    ],
    [{ enabled: false }, "native", false],
    [{ variant: undefined }, "translate_first", false],
    [{ variant: "control" }, "translate_first", false],
    [{ value: "Native", variant: "control" }, "native", false],
  ];
  const answers = cases.map(([overrides]) => experimentFlag(overrides));
  const { flags, problems } = setup(t, {
    [identitiesUrl]: () => identityAnswer([answers.shift()!]),
  });
  for (const [overrides, path, enrolled] of cases) {
    const decision = await flags.forOrder("abc", traits);
    const label = JSON.stringify(overrides);
    assert.equal(decision.exp_reading_path, path, label);
    assert.equal(decision.in_experiment, enrolled, label);
    assert.equal(decision.experiment !== undefined, enrolled, label);
  }
  assert.deepEqual(
    problems().map((line) => line.problem),
    [
      "the variant key does not match the value, so the order is not in the experiment",
      'Invalid option: expected one of "native"|"translate_first"',
    ],
  );
});

test("a failed identity call gives the defaults, with the segment from the language", async (t) => {
  const { flags } = setup(t, {
    [identitiesUrl]: () => new Response("busy", { status: 503 }),
  });
  assert.deepEqual(await flags.forOrder("abc", traits), {
    identity: "order:abc",
    ops_reading: "ai",
    cfg_sarvam: safeSarvam,
    exp_reading_path: "native",
    in_experiment: false,
    cfg_demo_trace: false,
    segment: "lang_kn",
    from: "defaults",
  });
});

test("the caller's signal stops the identity request, and an aborted signal makes no request", async (t) => {
  const { flags, callsTo } = setup(
    t,
    { [identitiesUrl]: ({ signal }) => hang(signal) },
    { timeoutMs: 60_000 },
  );
  const caller = new AbortController();
  const decision = flags.forOrder("abc", traits, caller.signal);
  setTimeout(() => caller.abort(), 10);
  assert.equal((await decision).from, "defaults");
  assert.equal(callsTo(identitiesUrl)[0]?.signal.aborted, true);
  const aborted = await flags.forOrder("def", traits, AbortSignal.abort());
  assert.equal(aborted.from, "defaults");
  assert.equal(callsTo(identitiesUrl).length, 1);
});

test("an identity request that times out gives the defaults", async (t) => {
  const { flags } = setup(
    t,
    { [identitiesUrl]: ({ signal }) => hang(signal) },
    { timeoutMs: 20 },
  );
  assert.equal((await flags.forOrder("abc", traits)).from, "defaults");
});

test("FLAGSMITH_API_URL sets the base of the flag requests", async (t) => {
  const { flags, calls } = setup(
    t,
    {
      "https://flags.example.com/api/v1/flags/": () =>
        answer([{ name: "ops_search", enabled: true, value: "plain" }]),
    },
    { apiUrl: "https://flags.example.com/api/v1" },
  );
  assert.equal((await flags.environment()).ops_search, "plain");
  assert.deepEqual(
    calls.map((call) => call.url),
    ["https://flags.example.com/api/v1/flags/"],
  );
});

test("exposures and conversions reach the events API when the client closes", async (t) => {
  const { flags, callsTo } = setup(t, {
    [identitiesUrl]: () => identityAnswer([experimentFlag()]),
    [eventsUrl]: () => new Response(null, { status: 202 }),
  });
  const decision = await flags.forOrder("abc", traits);
  flags.recordExposure(decision);
  flags.recordExposure({ ...decision, in_experiment: false });
  flags.recordConversion("abc");
  assert.equal(callsTo(eventsUrl).length, 0);
  await flags.close(1000);
  const [call, extra] = callsTo(eventsUrl);
  assert.equal(extra, undefined);
  assert.equal(call?.method, "POST");
  assert.equal(call?.headers.get("X-Environment-Key"), key);
  const { events } = call?.body as { events: Record<string, unknown>[] };
  assert.deepEqual(
    events.map(({ event, feature_name, identifier, value, metadata }) => ({
      event,
      feature_name,
      identifier,
      value,
      experiment_id: (metadata as Record<string, unknown>).experiment_id,
    })),
    [
      {
        event: "$flag_exposure",
        feature_name: "exp_reading_path",
        identifier: "order:abc",
        value: "translate_first",
        experiment_id: 167,
      },
      {
        event: "order_saved_unedited",
        feature_name: null,
        identifier: "order:abc",
        value: null,
        experiment_id: undefined,
      },
    ],
  );
});

test("close waits for the events API no longer than its timeout", async (t) => {
  const { flags, callsTo } = setup(t, {
    [eventsUrl]: ({ signal }) => hang(signal),
  });
  flags.recordConversion("abc");
  const start = performance.now();
  await flags.close(50);
  assert.ok(performance.now() - start < 1000);
  assert.equal(callsTo(eventsUrl).length, 1);
});

test("an error message with the key in it reaches the log without the key", async (t) => {
  const { flags, lines } = setup(t, {
    [flagsUrl]: () => {
      throw new TypeError(`fetch failed for ${key}`);
    },
  });
  assert.deepEqual(await flags.environment(), flagDefaults);
  const failure = lines.find((line) => line.msg === "flagsmith");
  assert.match(String(failure?.error), /\[environment key\]/);
  assert.ok(lines.every((line) => !JSON.stringify(line).includes(key)));
});
