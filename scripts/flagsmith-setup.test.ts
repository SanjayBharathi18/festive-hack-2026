import assert from "node:assert/strict";
import { test } from "node:test";
import { safeSarvam } from "../server/flags/decisions.ts";
import {
  formatReport,
  maskUrl,
  runSetup,
  statePatch,
  type FlagState,
} from "./flagsmith-setup.ts";

type Value = { type: string; value: string } | null;
type Variant = { id: number; weight: number };
type Override = {
  segment: { id: number };
  priority: number;
  enabled: boolean;
  value: Value;
  variants: Variant[];
};
type State = {
  environment_default: { enabled: boolean; value: Value; variants: Variant[] };
  segment_overrides: Override[];
};
type Body = Record<string, any>;
type Handler = (match: RegExpMatchArray, body: Body, url: URL) => Response;
type Options = {
  applyDefaults?: boolean;
  warehouses?: string[];
  failOnce?: { method: string; path: RegExp; status: number; body?: string };
};

const orgKey = "org_flagsmith_secret_value";
const webhookToken = "nudgebee_token_secret_value";
const webhookUrl = `https://app.nudgebee.com/api/webhooks/workflow?token=${webhookToken}`;
const env = {
  FLAGSMITH_ORG_API_KEY: orgKey,
  FLAGSMITH_PROJECT_ID: "12",
  NUDGEBEE_FLAG_WEBHOOK_URL: webhookUrl,
};

function fakeFlagsmith(options: Options = {}) {
  const { applyDefaults = false, warehouses = ["devkey", "prodkey"] } = options;
  let lastId = 100;
  let failOnce = options.failOnce;
  const nextId = () => (lastId += 1);
  const projects = [
    { id: 12, name: "Festive orders", organisation: 1 },
    { id: 13, name: "Other", organisation: 1 },
  ];
  const environments = [
    { id: 1, name: "Development", api_key: "devkey", project: 12 },
    { id: 2, name: "Production", api_key: "prodkey", project: 12 },
  ];
  const features: Body[] = [];
  const variations: Body[] = [];
  const segments: Body[] = [];
  const states = new Map<string, State>();
  const webhooks = new Map<string, Body[]>();
  const metrics = new Map<string, Body[]>();
  const experiments = new Map<string, Body[]>();
  const experimentMetrics = new Map<number, Body[]>();
  const requests: {
    method: string;
    url: URL;
    body: Body | undefined;
    authorization: string | null;
  }[] = [];
  const listOf = <T>(map: Map<string | number, T[]>, key: string | number) => {
    const list = map.get(key) ?? [];
    map.set(key, list);
    return list;
  };
  const stateOf = (key: string, featureId: number | string) => {
    const state = states.get(`${key}:${featureId}`);
    if (state === undefined) throw new Error(`No state ${key}:${featureId}`);
    return state;
  };
  const created = (item: unknown) => Response.json(item, { status: 201 });

  const routes: [string, RegExp, Handler][] = [
    ["GET", /^v1\/projects\/$/, () => Response.json(projects)],
    [
      "GET",
      /^v1\/environments\/$/,
      (_, __, url) =>
        page(
          environments.filter(
            ({ project }) =>
              String(project) === url.searchParams.get("project"),
          ),
          url,
        ),
    ],
    [
      "GET",
      /^v1\/projects\/12\/features\/$/,
      (_, __, url) => page(features, url),
    ],
    [
      "POST",
      /^v1\/projects\/12\/features\/$/,
      (_, body) => {
        if (features.some(({ name }) => name === body.name)) {
          return Response.json({ name: ["exists"] }, { status: 400 });
        }
        const feature = { ...body, id: nextId(), project: 12 };
        features.push(feature);
        for (const { api_key } of environments) {
          states.set(`${api_key}:${feature.id}`, {
            environment_default: applyDefaults
              ? {
                  enabled: body.default_enabled,
                  value:
                    body.initial_value === null
                      ? null
                      : { type: "string", value: body.initial_value },
                  variants: [],
                }
              : { enabled: false, value: null, variants: [] },
            segment_overrides: [],
          });
        }
        return created(feature);
      },
    ],
    [
      "GET",
      /^v1\/projects\/12\/features\/(\d+)\/mv-options\/$/,
      (match, _, url) =>
        page(
          variations.filter(({ feature }) => feature === Number(match[1])),
          url,
        ),
    ],
    [
      "POST",
      /^v1\/projects\/12\/features\/(\d+)\/mv-options\/$/,
      (match, body) => {
        const variation = { ...body, id: nextId(), feature: Number(match[1]) };
        variations.push(variation);
        if (applyDefaults) {
          for (const { api_key } of environments) {
            stateOf(
              api_key,
              variation.feature,
            ).environment_default.variants.push({
              id: variation.id,
              weight: body.default_percentage_allocation,
            });
          }
        }
        return created(variation);
      },
    ],
    [
      "PATCH",
      /^v1\/projects\/12\/features\/\d+\/mv-options\/(\d+)\/$/,
      (match, body) => {
        const variation = variations.find(({ id }) => id === Number(match[1]));
        Object.assign(variation ?? {}, body);
        return Response.json(variation);
      },
    ],
    [
      "GET",
      /^v1\/projects\/12\/segments\/$/,
      (_, __, url) => page(segments, url),
    ],
    [
      "POST",
      /^v1\/projects\/12\/segments\/$/,
      (_, body) => {
        const segment = { ...body, id: nextId(), feature: null };
        segments.push(segment);
        return created(segment);
      },
    ],
    [
      "GET",
      /^__future__\/environments\/(\w+)\/features\/(\d+)\/$/,
      (match) => Response.json(stateOf(match[1]!, match[2]!)),
    ],
    [
      "PATCH",
      /^__future__\/environments\/(\w+)\/features\/(\d+)\/$/,
      (match, body) => {
        const state = stateOf(match[1]!, match[2]!);
        Object.assign(state.environment_default, body.environment_default);
        for (const override of body.segment_overrides ?? []) {
          const found = state.segment_overrides.find(
            ({ segment }) => segment.id === override.segment.id,
          );
          if (found !== undefined) {
            Object.assign(found, override);
            continue;
          }
          state.segment_overrides.push({
            segment: override.segment,
            priority: override.priority ?? state.segment_overrides.length,
            enabled: override.enabled ?? state.environment_default.enabled,
            value: override.value ?? state.environment_default.value,
            variants: override.variants ?? [],
          });
        }
        const priorities = state.segment_overrides.map((o) => o.priority);
        if (new Set(priorities).size !== priorities.length) {
          return Response.json({ detail: "same priority" }, { status: 400 });
        }
        return Response.json(state);
      },
    ],
    [
      "GET",
      /^v1\/environments\/(\w+)\/warehouse-connections\/$/,
      (match) =>
        Response.json(
          warehouses.includes(match[1]!)
            ? [{ id: 9, warehouse_type: "flagsmith", status: "connected" }]
            : [],
        ),
    ],
    [
      "GET",
      /^v1\/environments\/(\w+)\/experiment-metrics\/$/,
      (match, _, url) => page(listOf(metrics, match[1]!), url),
    ],
    [
      "POST",
      /^v1\/environments\/(\w+)\/experiment-metrics\/$/,
      (match, body) => {
        const metric = { ...body, id: nextId() };
        listOf(metrics, match[1]!).push(metric);
        return created(metric);
      },
    ],
    [
      "GET",
      /^v1\/environments\/(\w+)\/experiments\/$/,
      (match, _, url) => {
        const search = url.searchParams.get("q")?.toLowerCase() ?? "";
        return page(
          listOf(experiments, match[1]!)
            .filter(({ name }) => name.toLowerCase().includes(search))
            .map(({ feature, ...rest }) => ({
              ...rest,
              feature: { id: feature, name: "exp_reading_path" },
            })),
          url,
        );
      },
    ],
    [
      "POST",
      /^v1\/environments\/(\w+)\/experiments\/$/,
      (match, body) => {
        const experiment = { ...body, id: nextId(), status: "created" };
        listOf(experiments, match[1]!).push(experiment);
        return created(experiment);
      },
    ],
    [
      "GET",
      /^v1\/environments\/\w+\/experiments\/(\d+)\/metrics\/$/,
      (match) => Response.json(listOf(experimentMetrics, Number(match[1]))),
    ],
    [
      "POST",
      /^v1\/environments\/\w+\/experiments\/(\d+)\/metrics\/$/,
      (match, body) => {
        const metric = { ...body, id: nextId() };
        listOf(experimentMetrics, Number(match[1])).push(metric);
        return created(metric);
      },
    ],
    [
      "GET",
      /^v1\/environments\/(\w+)\/webhooks\/$/,
      (match) => Response.json(listOf(webhooks, match[1]!)),
    ],
    [
      "POST",
      /^v1\/environments\/(\w+)\/webhooks\/$/,
      (match, body) => {
        const webhook = { ...body, id: nextId(), secret: "" };
        listOf(webhooks, match[1]!).push(webhook);
        return created(webhook);
      },
    ],
  ];

  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Body)
        : undefined;
    requests.push({
      method,
      url,
      body,
      authorization: new Headers(init?.headers).get("Authorization"),
    });
    const path = url.pathname.replace(/^\/api\//, "");
    if (failOnce?.method === method && failOnce.path.test(path)) {
      const { status, body: text = '{"detail":"busy"}' } = failOnce;
      failOnce = undefined;
      return new Response(text, { status });
    }
    for (const [routeMethod, pattern, handle] of routes) {
      const match = path.match(pattern);
      if (routeMethod === method && match !== null) {
        return handle(match, body ?? {}, url);
      }
    }
    return Response.json({ detail: "Not found." }, { status: 404 });
  }) as typeof fetch;

  const featureId = (name: string) =>
    features.find((feature) => feature.name === name)?.id as number;
  return {
    send,
    requests,
    features,
    variations,
    segments,
    metrics,
    experiments,
    experimentMetrics,
    webhooks,
    featureId,
    segmentId: (name: string) =>
      segments.find((segment) => segment.name === name)?.id as number,
    state: (key: string, name: string) => stateOf(key, featureId(name)),
    writes: () => requests.filter(({ method }) => method !== "GET"),
  };
}

function page(items: unknown[], url: URL): Response {
  const number = Number(url.searchParams.get("page") ?? "1");
  const size = 4;
  const next = new URL(url);
  next.searchParams.set("page", String(number + 1));
  return Response.json({
    count: items.length,
    next: number * size < items.length ? next.href : null,
    previous: null,
    results: items.slice((number - 1) * size, number * size),
  });
}

function conditionOf(segment: Body): unknown {
  const condition = segment.rules[0].rules[0].conditions[0];
  return [segment.rules[0].type, segment.rules[0].rules[0].type, condition];
}

test("with no organisation key, the script stops with the next step and calls nothing", async () => {
  const fake = fakeFlagsmith();
  const report = await runSetup({ env: {}, fetch: fake.send });
  assert.match(
    report.failure ?? "",
    /^No FLAGSMITH_ORG_API_KEY, so the script made nothing\. Next: /,
  );
  assert.equal(fake.requests.length, 0);
});

test("with no project id, the script lists the projects and makes nothing", async () => {
  const fake = fakeFlagsmith();
  const report = await runSetup({
    env: { FLAGSMITH_ORG_API_KEY: orgKey },
    fetch: fake.send,
  });
  assert.equal(
    report.failure,
    "No FLAGSMITH_PROJECT_ID. Next: set it in .env to the number of the project, then run the script again. Projects: 12 (Festive orders), 13 (Other).",
  );
  assert.deepEqual(
    fake.requests.map(({ method, url }) => `${method} ${url.pathname}`),
    ["GET /api/v1/projects/"],
  );
});

test("a variable that is not valid stops the script, and the message does not repeat the value", async () => {
  const fake = fakeFlagsmith();
  const report = await runSetup({
    env: {
      ...env,
      FLAGSMITH_PROJECT_ID: "twelve",
      NUDGEBEE_FLAG_WEBHOOK_URL: `http://app.nudgebee.com/?token=${webhookToken}`,
    },
    fetch: fake.send,
  });
  assert.match(report.failure ?? "", /FLAGSMITH_PROJECT_ID must be the number/);
  assert.match(
    report.failure ?? "",
    /NUDGEBEE_FLAG_WEBHOOK_URL must be the https/,
  );
  assert.ok(!(report.failure ?? "").includes(webhookToken));
  assert.equal(fake.requests.length, 0);
});

test("an unknown live environment stops the script before it makes anything", async () => {
  const fake = fakeFlagsmith();
  const report = await runSetup({
    env: { ...env, FLAGSMITH_LIVE_ENVIRONMENT: "Staging" },
    fetch: fake.send,
  });
  assert.equal(
    report.failure,
    "Project Festive orders has no environment named Staging. Next: set FLAGSMITH_LIVE_ENVIRONMENT to one of: Development, Production.",
  );
  assert.deepEqual(fake.writes(), []);
});

test("a first run makes the flags, the variation, the segments and the defaults in each environment", async () => {
  const fake = fakeFlagsmith();
  const report = await runSetup({ env, fetch: fake.send });
  assert.equal(report.failure, undefined);
  assert.deepEqual(
    fake.features.map(({ name, type, default_enabled, initial_value }) => [
      name,
      type,
      default_enabled,
      initial_value,
    ]),
    [
      ["ops_voice", "STANDARD", true, null],
      ["ops_reading", "STANDARD", true, "ai"],
      ["ops_suggestions", "STANDARD", true, "ai"],
      ["ops_search", "STANDARD", true, "ai"],
      ["ops_transliteration", "STANDARD", true, "ai"],
      ["ops_translation", "STANDARD", true, "ai"],
      ["ops_review_check", "STANDARD", true, "ai"],
      ["exp_reading_path", "MULTIVARIATE", true, "native"],
      ["cfg_sarvam", "STANDARD", true, JSON.stringify(safeSarvam, null, 2)],
      ["cfg_demo_trace", "STANDARD", false, null],
    ],
  );
  assert.ok(fake.features.every(({ description }) => description.length > 0));
  assert.deepEqual(
    fake.variations.map(
      ({ feature, type, string_value, key, default_percentage_allocation }) => [
        feature,
        type,
        string_value,
        key,
        default_percentage_allocation,
      ],
    ),
    [
      [
        fake.featureId("exp_reading_path"),
        "unicode",
        "translate_first",
        "translate_first",
        0,
      ],
    ],
  );
  assert.deepEqual(
    fake.segments.map((segment) => [segment.name, conditionOf(segment)]),
    [
      [
        "lang_kn",
        [
          "ALL",
          "ANY",
          { operator: "EQUAL", property: "language", value: "kn-IN" },
        ],
      ],
      [
        "lang_hi",
        [
          "ALL",
          "ANY",
          { operator: "EQUAL", property: "language", value: "hi-IN" },
        ],
      ],
      [
        "lang_en",
        [
          "ALL",
          "ANY",
          { operator: "EQUAL", property: "language", value: "en-IN" },
        ],
      ],
      [
        "demo",
        [
          "ALL",
          "ANY",
          { operator: "EQUAL", property: "is_demo", value: "true" },
        ],
      ],
    ],
  );
  for (const key of ["devkey", "prodkey"]) {
    assert.deepEqual(fake.state(key, "ops_reading").environment_default, {
      enabled: true,
      value: { type: "string", value: "ai" },
      variants: [],
    });
    assert.equal(
      fake.state(key, "ops_voice").environment_default.enabled,
      true,
    );
    const trace = fake.state(key, "cfg_demo_trace");
    assert.equal(trace.environment_default.enabled, false);
    assert.deepEqual(
      trace.segment_overrides.map(({ segment, enabled }) => [
        segment.id,
        enabled,
      ]),
      [[fake.segmentId("demo"), true]],
    );
    const path = fake.state(key, "exp_reading_path").environment_default;
    assert.deepEqual(path.value, { type: "string", value: "native" });
    assert.equal(path.enabled, true);
    assert.deepEqual(path.variants, []);
    const sarvam = fake.state(key, "cfg_sarvam").environment_default.value;
    assert.deepEqual(JSON.parse(sarvam?.value ?? ""), safeSarvam);
  }
  assert.deepEqual(fake.state("devkey", "ops_reading").segment_overrides, []);
  assert.deepEqual(fake.state("prodkey", "ops_reading").segment_overrides, [
    {
      segment: { id: fake.segmentId("lang_kn") },
      priority: 0,
      enabled: true,
      value: { type: "string", value: "ai" },
      variants: [],
    },
  ]);
  assert.ok(
    report.made.includes(
      "Production: override of ops_reading for the segment lang_kn, ai",
    ),
  );
  assert.ok(
    report.byHand.includes(
      "In Production, ops_reading has an override for lang_kn, so that the NudgeBee rollback only changes its value. To switch ops_reading for every language at once, change two things: the environment default and this override.",
    ),
  );
  assert.ok(
    fake.requests.every(
      ({ authorization }) => authorization === `Api-Key ${orgKey}`,
    ),
  );
});

test("a first run makes the metric and the experiment, not started, and the webhook, in the live environment only", async () => {
  const fake = fakeFlagsmith();
  const report = await runSetup({ env, fetch: fake.send });
  const [metric, ...otherMetrics] = fake.metrics.get("prodkey") ?? [];
  assert.deepEqual(otherMetrics, []);
  assert.deepEqual(
    [metric?.name, metric?.aggregation, metric?.direction, metric?.definition],
    [
      "order_saved_unedited",
      "occurrence",
      "up",
      { version: 1, event: "order_saved_unedited" },
    ],
  );
  const [experiment, ...otherExperiments] =
    fake.experiments.get("prodkey") ?? [];
  assert.deepEqual(otherExperiments, []);
  assert.equal(experiment?.feature, fake.featureId("exp_reading_path"));
  assert.equal(experiment?.status, "created");
  assert.match(
    experiment?.hypothesis,
    /^Does native reading need fewer corrections than translate-first reading\?/,
  );
  assert.deepEqual(experiment?.experiment_rollout, {
    enabled: true,
    rollout_percentage: 100,
    feature_state_value: { type: "string", value: "native" },
    multivariate_feature_state_values: [
      {
        multivariate_feature_option: fake.variations[0]?.id,
        percentage_allocation: 50,
      },
    ],
  });
  assert.deepEqual(
    (fake.experimentMetrics.get(experiment?.id) ?? []).map(
      ({ metric: id, expected_direction }) => [id, expected_direction],
    ),
    [[metric?.id, "increase"]],
  );
  assert.deepEqual(
    (fake.webhooks.get("prodkey") ?? []).map(({ url, enabled }) => [
      url,
      enabled,
    ]),
    [[webhookUrl, true]],
  );
  assert.equal(fake.metrics.get("devkey"), undefined);
  assert.equal(fake.experiments.get("devkey"), undefined);
  assert.equal(fake.webhooks.get("devkey"), undefined);
  assert.deepEqual(report.rollback, {
    environment: "Production",
    environmentKey: "prodkey",
    opsReadingFeatureId: fake.featureId("ops_reading"),
    langKnSegmentId: fake.segmentId("lang_kn"),
  });
  const start = report.byHand.find((step) =>
    step.startsWith(
      `Start the experiment "Reading path" in Production when the experiment run begins`,
    ),
  );
  assert.match(
    start ?? "",
    /Starting it sets the 50\/50 split\. Until then every desk reading is native, because the variation has weight 0% on the flag\./,
  );
  assert.ok(
    report.made.includes(
      "variation translate_first of exp_reading_path, key translate_first, weight 0% until the experiment starts",
    ),
  );
  assert.ok(
    report.byHand.some((step) =>
      step.endsWith(
        `/project/12/environment/prodkey/experiments/${experiment?.id}`,
      ),
    ),
  );
});

test("the printed report names what was made, the steps by hand and the rollback values, with no secret", async () => {
  const fake = fakeFlagsmith();
  const printed = formatReport(await runSetup({ env, fetch: fake.send }));
  assert.match(printed, /^Made:$/m);
  assert.match(printed, /^ {2}- flag ops_reading$/m);
  assert.match(
    printed,
    /^ {2}- webhook of Production to https:\/\/app\.nudgebee\.com\/api\/webhooks\/workflow\?…$/m,
  );
  assert.match(printed, /^Still to do by hand:$/m);
  assert.match(
    printed,
    /^Values for the NudgeBee rollback workflow \(Production\):$/m,
  );
  assert.match(
    printed,
    /environment key \(the client-side key, which is not secret\): prodkey$/m,
  );
  assert.match(
    printed,
    new RegExp(
      `ops_reading feature id: ${fake.featureId("ops_reading")}$`,
      "m",
    ),
  );
  assert.match(
    printed,
    new RegExp(`lang_kn segment id: ${fake.segmentId("lang_kn")}$`, "m"),
  );
  assert.ok(!printed.includes(orgKey));
  assert.ok(!printed.includes(webhookToken));
});

test("a second run finds everything and makes nothing", async () => {
  const fake = fakeFlagsmith();
  await runSetup({ env, fetch: fake.send });
  const writes = fake.writes().length;
  const report = await runSetup({ env, fetch: fake.send });
  assert.equal(report.failure, undefined);
  assert.deepEqual(report.made, []);
  assert.equal(fake.writes().length, writes);
  assert.ok(report.found.includes("flag cfg_sarvam"));
  assert.ok(report.found.includes("segment demo"));
  assert.ok(
    report.found.includes('experiment "Reading path" in Production (created)'),
  );
  assert.equal(fake.experiments.get("prodkey")?.length, 1);
  assert.ok(
    fake.requests
      .filter(({ url }) => url.pathname.endsWith("/experiments/"))
      .every(({ url }) => !url.searchParams.has("q")),
  );
  assert.match(
    formatReport(report),
    /^Made: nothing\. Everything was already there\.$/m,
  );
});

test("when Flagsmith applies the defaults itself, only the overrides are set", async () => {
  const fake = fakeFlagsmith({ applyDefaults: true });
  await runSetup({ env, fetch: fake.send });
  const traceId = fake.featureId("cfg_demo_trace");
  const readingId = fake.featureId("ops_reading");
  assert.deepEqual(
    fake
      .writes()
      .filter(({ method }) => method === "PATCH")
      .map(({ url }) => url.pathname),
    [
      `/api/__future__/environments/devkey/features/${traceId}/`,
      `/api/__future__/environments/prodkey/features/${readingId}/`,
      `/api/__future__/environments/prodkey/features/${traceId}/`,
    ],
  );
});

test("a weight of translate_first above 0 goes back to 0 while no experiment runs, and stays while one runs", async () => {
  const fake = fakeFlagsmith();
  await runSetup({ env, fetch: fake.send });
  const variationId = fake.variations[0]?.id as number;
  for (const key of ["devkey", "prodkey"]) {
    fake.state(key, "exp_reading_path").environment_default.variants = [
      { id: variationId, weight: 50 },
    ];
  }
  const experiment = fake.experiments.get("prodkey")?.[0];
  if (experiment === undefined) throw new Error("No experiment.");
  experiment.status = "running";
  const report = await runSetup({ env, fetch: fake.send });
  assert.deepEqual(report.made, [
    "Development: weight of the variation translate_first of exp_reading_path back to 0% from 50%, because no experiment runs",
  ]);
  assert.deepEqual(
    fake.state("devkey", "exp_reading_path").environment_default.variants,
    [{ id: variationId, weight: 0 }],
  );
  assert.deepEqual(
    fake.state("prodkey", "exp_reading_path").environment_default.variants,
    [{ id: variationId, weight: 50 }],
  );
  assert.ok(
    report.byHand.includes(
      'In Production, the variation translate_first of exp_reading_path has weight 50% on the flag while the experiment "Reading path" is running, so the script left the weight as it is. After the experiment ends, run the script again to set it back to 0%.',
    ),
  );
  experiment.status = "created";
  const later = await runSetup({ env, fetch: fake.send });
  assert.deepEqual(later.made, [
    "Production: weight of the variation translate_first of exp_reading_path back to 0% from 50%, because no experiment runs",
  ]);
});

test("a cancelled run stops at the next call, and says what was made", async () => {
  const fake = fakeFlagsmith();
  const cancel = new AbortController();
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST" && String(input).endsWith("/segments/")) {
      cancel.abort();
    }
    return fake.send(input, init);
  }) as typeof fetch;
  const report = await runSetup({ env, fetch: send, signal: cancel.signal });
  assert.equal(
    report.failure,
    "Cancelled during POST /api/v1/projects/12/segments/. Next: run the script again. It makes only what is missing.",
  );
  assert.ok(report.made.includes("flag cfg_demo_trace"));
  assert.equal(fake.segments.length, 0);
  assert.equal(report.rollback, undefined);
});

test("the setup uses FLAGSMITH_ADMIN_API_URL, and FLAGSMITH_API_URL is for the SDK only", async () => {
  const fake = fakeFlagsmith();
  const base = "https://flags.example.com/api/v1/";
  const send = (async (input: string | URL | Request, init?: RequestInit) =>
    fake.send(
      String(input).replace(
        "https://flags.example.com/",
        "https://api.flagsmith.com/",
      ),
      init,
    )) as typeof fetch;
  const hosts = new Set<string>();
  const report = await runSetup({
    env: {
      ...env,
      FLAGSMITH_ADMIN_API_URL: base,
      FLAGSMITH_API_URL: "https://edge.api.flagsmith.com/api/v1/",
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      hosts.add(new URL(String(input)).host);
      return send(input, init);
    }) as typeof fetch,
  });
  assert.equal(report.failure, undefined);
  assert.deepEqual([...hosts], ["flags.example.com"]);
});

test("with no warehouse in the live environment, the script makes no metric or experiment, and says what to do", async () => {
  const fake = fakeFlagsmith({ warehouses: ["devkey"] });
  const report = await runSetup({ env, fetch: fake.send });
  assert.equal(report.failure, undefined);
  assert.equal(
    fake.requests.filter(({ url }) => /experiment/.test(url.pathname)).length,
    0,
  );
  assert.ok(
    report.byHand.some(
      (step) =>
        step.startsWith("Turn on the warehouse in Production:") &&
        step.endsWith(
          "Then run this script again to make the metric and the experiment.",
        ),
    ),
  );
  assert.deepEqual(fake.webhooks.get("prodkey")?.length, 1);
});

test("a variation without a key gets the key translate_first", async () => {
  const fake = fakeFlagsmith();
  await runSetup({ env, fetch: fake.send });
  const [variation] = fake.variations;
  if (variation === undefined) throw new Error("No variation.");
  variation.key = null;
  const report = await runSetup({ env, fetch: fake.send });
  assert.deepEqual(report.made, [
    "key translate_first of the variation translate_first of exp_reading_path",
  ]);
  assert.equal(variation.key, "translate_first");
});

test("a create that fails is not retried, the report says what to do, and a new run makes the rest", async () => {
  const fake = fakeFlagsmith({
    failOnce: {
      method: "POST",
      path: /^v1\/projects\/12\/segments\/$/,
      status: 503,
    },
  });
  const first = await runSetup({ env, fetch: fake.send });
  assert.equal(
    first.failure,
    "Flagsmith answered POST /api/v1/projects/12/segments/ with 503. Next: run the script again in a few minutes. It makes only what is missing.",
  );
  assert.equal(first.rollback, undefined);
  assert.ok(first.made.includes("flag cfg_demo_trace"));
  assert.equal(
    fake.requests.filter(
      ({ method, url }) =>
        method === "POST" && url.pathname.endsWith("/segments/"),
    ).length,
    1,
  );
  assert.match(formatReport(first), /^Stopped: Flagsmith answered POST/m);
  const second = await runSetup({ env, fetch: fake.send });
  assert.equal(second.failure, undefined);
  assert.ok(second.made.includes('segment lang_kn: "language" equals kn-IN'));
  assert.ok(!second.made.some((item) => item.startsWith("flag ")));
  assert.equal(fake.segments.length, 4);
});

test("a refusal names the status and the detail, with the secrets removed", async () => {
  const fake = fakeFlagsmith({
    failOnce: {
      method: "POST",
      path: /webhooks\/$/,
      status: 400,
      body: JSON.stringify({ url: [`${webhookUrl} is not allowed`] }),
    },
  });
  const report = await runSetup({ env, fetch: fake.send });
  assert.match(
    report.failure ?? "",
    /^Flagsmith refused POST \/api\/v1\/environments\/prodkey\/webhooks\/ \(400: /,
  );
  assert.match(report.failure ?? "", /\[secret\]/);
  assert.ok(!(report.failure ?? "").includes(webhookToken));
});

test("a webhook that is off is reported as a step by hand, not made again", async () => {
  const fake = fakeFlagsmith();
  await runSetup({ env, fetch: fake.send });
  const [webhook] = fake.webhooks.get("prodkey") ?? [];
  if (webhook === undefined) throw new Error("No webhook.");
  webhook.enabled = false;
  const report = await runSetup({ env, fetch: fake.send });
  assert.ok(
    report.byHand.includes(
      "The webhook of Production to https://app.nudgebee.com/api/webhooks/workflow?… is off. Turn it on: Environment Settings, Webhooks.",
    ),
  );
  assert.equal(fake.webhooks.get("prodkey")?.length, 1);
});

test("with no webhook URL, the script says how to set it", async () => {
  const fake = fakeFlagsmith();
  const report = await runSetup({
    env: { ...env, NUDGEBEE_FLAG_WEBHOOK_URL: "" },
    fetch: fake.send,
  });
  assert.ok(
    report.byHand.some((step) =>
      step.startsWith("Set NUDGEBEE_FLAG_WEBHOOK_URL in .env"),
    ),
  );
  assert.equal(fake.webhooks.get("prodkey")?.length ?? 0, 0);
});

test("a segment with other rules is kept, and the report asks for a check", async () => {
  const fake = fakeFlagsmith();
  await runSetup({ env, fetch: fake.send });
  const hindi = fake.segments.find(({ name }) => name === "lang_hi");
  hindi!.rules[0].rules[0].conditions[0].value = "hi";
  const report = await runSetup({ env, fetch: fake.send });
  assert.ok(
    report.byHand.includes(
      'Check the rules of the segment lang_hi: the script expects "language" equals hi-IN, exactly.',
    ),
  );
});

test("statePatch keeps the choices of a person and adds only what is missing", () => {
  const blank: FlagState = {
    environment_default: { enabled: false, value: null, variants: [] },
    segment_overrides: [],
  };
  const context = { made: false, overrides: [] };
  const demo = { segmentId: 9, segment: "demo", enabled: true };
  const langKn = {
    segmentId: 7,
    segment: "lang_kn",
    enabled: true,
    value: "ai",
  };
  assert.equal(statePatch("ops_voice", blank, context), undefined);
  assert.deepEqual(
    statePatch("ops_voice", blank, { ...context, made: true })?.body,
    {
      environment_default: { enabled: true },
    },
  );
  assert.deepEqual(statePatch("ops_search", blank, context)?.body, {
    environment_default: {
      value: { type: "string", value: "ai" },
      enabled: true,
    },
  });
  const plain: FlagState = {
    environment_default: {
      enabled: false,
      value: { type: "string", value: "plain" },
      variants: [],
    },
    segment_overrides: [],
  };
  assert.equal(statePatch("ops_search", plain, context), undefined);
  const overridden: FlagState = {
    ...blank,
    segment_overrides: [
      { segment: { id: 3 }, priority: 0, enabled: false },
      { segment: { id: 4 }, priority: 3, enabled: true },
    ],
  };
  assert.deepEqual(
    statePatch("cfg_demo_trace", overridden, { ...context, overrides: [demo] })
      ?.body,
    {
      segment_overrides: [{ segment: { id: 9 }, enabled: true, priority: 4 }],
    },
  );
  const ai: FlagState = {
    environment_default: {
      enabled: true,
      value: { type: "string", value: "ai" },
      variants: [],
    },
    segment_overrides: overridden.segment_overrides,
  };
  const reading = statePatch("ops_reading", ai, {
    ...context,
    overrides: [langKn, { ...langKn, segmentId: 4 }],
  });
  assert.deepEqual(reading?.body, {
    segment_overrides: [
      {
        segment: { id: 7 },
        enabled: true,
        priority: 4,
        value: { type: "string", value: "ai" },
      },
    ],
  });
  assert.deepEqual(reading?.changes, [
    "override of ops_reading for the segment lang_kn, ai",
  ]);
  assert.deepEqual(
    statePatch("exp_reading_path", blank, { ...context, made: true })?.body,
    {
      environment_default: {
        value: { type: "string", value: "native" },
        enabled: true,
      },
    },
  );
  const weighted: FlagState = {
    environment_default: {
      enabled: true,
      value: { type: "string", value: "native" },
      variants: [{ id: 5, weight: 30 }],
    },
    segment_overrides: [],
  };
  assert.equal(
    statePatch("exp_reading_path", weighted, { ...context, made: true }),
    undefined,
  );
  assert.deepEqual(
    statePatch("exp_reading_path", weighted, { ...context, resetVariant: 5 })
      ?.body,
    { environment_default: { variants: [{ id: 5, weight: 0 }] } },
  );
  assert.equal(
    statePatch("exp_reading_path", weighted, { ...context, resetVariant: 6 }),
    undefined,
  );
});

test("maskUrl hides the query, where the token is", () => {
  assert.equal(
    maskUrl(webhookUrl),
    "https://app.nudgebee.com/api/webhooks/workflow?…",
  );
  assert.equal(maskUrl("https://example.com/hook"), "https://example.com/hook");
});
