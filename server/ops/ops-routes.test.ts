import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Hono } from "hono";
import { errorBodySchema } from "../../shared/errors.ts";
import {
  opsFlagsSchema,
  opsSarvamSchema,
  opsStateSchema,
  type OpsState,
} from "../../shared/ops.ts";
import { parseConfig, type Config } from "../config.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import { createExperimentTally } from "../flags/experiment-tally.ts";
import { createFlagOverrides } from "../flags/overrides.ts";
import type { AppEnv } from "../http/context.ts";
import { handleError } from "../http/errors.ts";
import { savedRecordings, summarizeRecordings } from "../sarvam/recorded.ts";
import { createTestApp, createTestClock } from "../test-app.ts";
import { seedStore } from "../test-store.ts";
import { signIn } from "../verify/test-sign-in.ts";
import { incidentSarvam } from "./incident.ts";
import { opsRoutes } from "./ops-routes.ts";
import { alertRule } from "./reading-window.ts";
import type { RollbackSettings } from "./rollback.ts";

const testKitchenPhone = "+919800000002";
const demoToken = "demo-desk-token-of-the-ops-tests";
const opsRoutePaths = [
  ["GET", "/api/ops/state"],
  ["GET", "/api/ops/flags"],
  ["GET", "/api/ops/sarvam"],
  ["POST", "/api/ops/trigger"],
  ["POST", "/api/ops/approve"],
  ["POST", "/api/ops/reject"],
  ["POST", "/api/ops/reset"],
] as const;
const kannada = [
  "ನಮಸ್ಕಾರ, ಶನಿವಾರಕ್ಕೆ ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್ ಮತ್ತು ಅರ್ಧ ಕೆಜಿ ಚಕ್ಕುಲಿ ಬೇಕು. ನನ್ನ ಹೆಸರು ಪ್ರಿಯಾ, ಜಯನಗರಕ್ಕೆ ಡೆಲಿವರಿ ಮಾಡಿ.",
  "ಭಾನುವಾರ ಎರಡು ಕೆಜಿ ಕಾಜು ಕಟ್ಲಿ ಬೇಕು. ನಾನೇ ಬಂದು ತಗೊಂಡು ಹೋಗ್ತೀನಿ. ಹೆಸರು ಸುರೇಶ್.",
];
const hindi = "आज शाम तक आधा किलो काजू कतली मिल सकती है? नाम नेहा।";

function testConfig(extra: Record<string, string> = {}): Config {
  const parsed = parseConfig({
    SESSION_SECRET: "test-session-secret-of-32-characters",
    SARVAM_MODE: "recorded",
    DEMO_DESK_TOKEN: demoToken,
    ...extra,
  });
  if (!parsed.ok) throw new Error("The test configuration is not valid.");
  return parsed.config;
}

async function setup(config = testConfig()) {
  const clock = createTestClock();
  const testApp = createTestApp({ clock, config });
  seedStore(testApp.deps.db, { isDemo: true });
  seedStore(testApp.deps.db, { slug: "test-kitchen", phone: testKitchenPhone });
  const cookie = await signIn(testApp.app, testKitchenPhone);
  const call = (method: string, path: string, body?: unknown) =>
    Promise.resolve(
      testApp.app.request(path, {
        method,
        headers: {
          Cookie: cookie,
          ...(path.startsWith("/api/ops/")
            ? { "X-Demo-Token": demoToken }
            : {}),
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
          "X-Forwarded-For": `203.0.113.${Math.floor(Math.random() * 250)}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  const state = async (method = "GET", path = "/api/ops/state") => {
    const response = await call(method, path);
    assert.equal(response.status, 200, await response.clone().text());
    return opsStateSchema.parse(await response.json());
  };
  const read = async (text: string, language: string) => {
    const response = await call("POST", "/api/desk/read", {
      text,
      language,
      source: "load",
    });
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as { outcome: string }).outcome;
  };
  return { ...testApp, clock, call, state, read };
}

const row = (state: OpsState, language: string) =>
  state.languages.find((entry) => entry.language === language);

test("the ops API needs the desk session or the demo token", async () => {
  const { app } = createTestApp();
  for (const [method, path] of opsRoutePaths) {
    const response = await app.request(path, { method });
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.equal(
      errorBodySchema.parse(await response.json()).error.code,
      "not_signed_in",
    );
  }
});

test("a seller's own desk session does not open the ops API: only the demo desk link does", async () => {
  const { app } = await setup();
  const cookie = await signIn(app, testKitchenPhone);
  for (const [method, path] of opsRoutePaths) {
    const response = await app.request(path, {
      method,
      headers: { Cookie: cookie, "Content-Type": "application/json" },
    });
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.equal(
      errorBodySchema.parse(await response.json()).error.code,
      "forbidden",
    );
  }
  const demo = await app.request("/api/ops/state", {
    headers: { "X-Demo-Token": demoToken },
  });
  assert.equal(demo.status, 200);
});

test("the simulated incident: bad override, alert, approval, recovery", async () => {
  const { state, read, call, deps } = await setup();
  const quiet = await state();
  assert.deepEqual(
    quiet.languages.map(({ language }) => language),
    ["kn-IN", "hi-IN", "en-IN"],
  );
  assert.equal(quiet.flags_from, "defaults");
  assert.equal(quiet.changes_via, "memory");
  assert.equal(quiet.recorded, true);
  assert.equal(quiet.window_seconds, 120);
  assert.equal(quiet.incident.step, "watching");

  const triggered = await state("POST", "/api/ops/trigger");
  assert.deepEqual(triggered.overrides, {
    bad_config: true,
    ops_reading: null,
  });

  for (let index = 0; index < 5; index += 1) {
    assert.equal(await read(kannada[index % 2] ?? "", "kn-IN"), "invalid");
  }
  assert.equal(await read(hindi, "hi-IN"), "ok");
  const alert = await state();
  assert.deepEqual(row(alert, "kn-IN"), {
    language: "kn-IN",
    readings: 5,
    invalid: 5,
    invalid_rate: 1,
    would_fire: true,
    held_seconds: 0,
    state: "pending",
  });
  assert.equal(row(alert, "hi-IN")?.would_fire, false);
  assert.equal(alert.incident.step, "approval");

  const approved = await state("POST", "/api/ops/approve");
  assert.equal(approved.incident.step, "approved");
  assert.equal(approved.incident.via, "memory");
  assert.equal(approved.overrides.ops_reading, "safe");
  assert.deepEqual(approved.incident.since_change, { readings: 0, invalid: 0 });

  assert.equal(await read(kannada[0] ?? "", "kn-IN"), "ok");
  assert.equal(await read(kannada[1] ?? "", "kn-IN"), "ok");
  const recovering = await state();
  assert.deepEqual(recovering.incident.since_change, {
    readings: 2,
    invalid: 0,
  });

  const again = await call("POST", "/api/ops/approve");
  assert.equal(again.status, 409);
  assert.equal(
    errorBodySchema.parse(await again.json()).error.code,
    "invalid_input",
  );

  const reset = await state("POST", "/api/ops/reset");
  assert.deepEqual(reset.overrides, { bad_config: false, ops_reading: null });
  assert.equal(reset.incident.since_change, null);
});

test("the alert fires after the condition holds for 2 minutes", async () => {
  const { state, read, clock } = await setup();
  await state("POST", "/api/ops/trigger");
  for (let index = 0; index < 5; index += 1) {
    await read(kannada[0] ?? "", "kn-IN");
  }
  assert.equal(row(await state(), "kn-IN")?.state, "pending");
  for (const _ of [1, 2]) {
    clock.advance(alertRule.holdMs / 2);
    for (let index = 0; index < 5; index += 1) {
      await read(kannada[1] ?? "", "kn-IN");
    }
    await state();
  }
  const firing = row(await state(), "kn-IN");
  assert.equal(firing?.state, "firing");
  assert.equal(firing?.held_seconds, 120);
  await state("POST", "/api/ops/reset");
});

test("reject changes nothing, and needs a waiting alert", async () => {
  const { state, read, call } = await setup();
  const early = await call("POST", "/api/ops/reject");
  assert.equal(early.status, 409);
  await state("POST", "/api/ops/trigger");
  for (let index = 0; index < 5; index += 1) {
    await read(kannada[0] ?? "", "kn-IN");
  }
  const rejected = await state("POST", "/api/ops/reject");
  assert.equal(rejected.incident.step, "rejected");
  assert.deepEqual(rejected.overrides, { bad_config: true, ops_reading: null });
  assert.equal(await read(kannada[0] ?? "", "kn-IN"), "invalid");
  await state("POST", "/api/ops/reset");
});

test("with flags from Flagsmith, the trigger is refused", async () => {
  const { call } = await setup(
    testConfig({ FLAGSMITH_ENVIRONMENT_KEY: "ser.test-environment-key" }),
  );
  const response = await call("POST", "/api/ops/trigger");
  assert.equal(response.status, 403);
  assert.equal(
    errorBodySchema.parse(await response.json()).error.code,
    "forbidden",
  );
});

test("with Flagsmith connected, approve sends the rollback PATCH", async () => {
  const testApp = createTestApp();
  const { deps } = testApp;
  seedStore(deps.db, { isDemo: true });
  const config = testConfig({
    FLAGSMITH_ENVIRONMENT_KEY: "ser.test-environment-key",
    FLAGSMITH_ORG_API_KEY: "org-key",
    FLAGSMITH_ROLLBACK_ENVIRONMENT_KEY: "EnvKey",
    FLAGSMITH_OPS_READING_FEATURE_ID: "11",
    FLAGSMITH_LANG_KN_SEGMENT_ID: "22",
  });
  const sent: RollbackSettings[] = [];
  let answer: { ok: true } | { ok: false; status: number } = {
    ok: false,
    status: 403,
  };
  const overrides = createFlagOverrides(createDefaultFlags());
  overrides.set("lang_kn", { cfg_sarvam: incidentSarvam });
  const app = new Hono<AppEnv>().onError(handleError(deps.log)).route(
    "/",
    opsRoutes({
      ...deps,
      config,
      overrides,
      experiment: createExperimentTally(overrides.flags),
      sendRollback: async (settings) => {
        sent.push(settings);
        return answer;
      },
    }),
  );
  for (let index = 0; index < 5; index += 1) {
    deps.metrics.readingResults.inc({
      language: "kn-IN",
      variant: "native",
      path: "ai",
      outcome: "invalid",
    });
  }
  const approve = () =>
    Promise.resolve(
      app.request("/api/ops/approve", {
        method: "POST",
        headers: { "X-Demo-Token": demoToken },
      }),
    );
  const refused = await approve();
  assert.equal(refused.status, 502);
  assert.match(
    errorBodySchema.parse(await refused.json()).error.message,
    /Flagsmith answered 403/,
  );
  answer = { ok: true };
  const done = await approve();
  assert.equal(done.status, 200);
  const body = opsStateSchema.parse(await done.json());
  assert.equal(body.changes_via, "flagsmith");
  assert.equal(body.incident.via, "flagsmith");
  assert.equal(body.overrides.ops_reading, null);
  assert.deepEqual(sent[0], {
    adminUrl: "https://api.flagsmith.com/api/v1/",
    orgKey: "org-key",
    environmentKey: "EnvKey",
    featureId: 11,
    segmentId: 22,
  });
});

const secrets = {
  FLAGSMITH_ENVIRONMENT_KEY: "ser.secret-environment-key",
  FLAGSMITH_ORG_API_KEY: "secret-organisation-key",
  FLAGSMITH_ROLLBACK_ENVIRONMENT_KEY: "secret-client-side-key",
  SARVAM_API_KEY: "secret-sarvam-key",
};

test("the console names each key with whether it is set, and returns no secret", async () => {
  const { call } = await setup(
    testConfig({
      ...secrets,
      FLAGSMITH_API_URL: "https://user:secret-password@flags.example/api/v1/",
    }),
  );
  const flags = await call("GET", "/api/ops/flags");
  assert.equal(flags.status, 200);
  assert.equal(flags.headers.get("Cache-Control"), "no-store");
  const sarvam = await call("GET", "/api/ops/sarvam");
  assert.equal(sarvam.status, 200);
  const flagsText = await flags.text();
  const sarvamText = await sarvam.text();
  for (const secret of [...Object.values(secrets), "secret-password"]) {
    assert.ok(!flagsText.includes(secret), secret);
    assert.ok(!sarvamText.includes(secret), secret);
  }
  const { connection } = opsFlagsSchema.parse(JSON.parse(flagsText));
  assert.equal(connection.source, "flagsmith");
  assert.equal(connection.api_url, "https://flags.example/api/v1/");
  assert.deepEqual(connection.keys, [
    { name: "FLAGSMITH_ENVIRONMENT_KEY", set: true },
    { name: "FLAGSMITH_ORG_API_KEY", set: true },
    { name: "FLAGSMITH_ROLLBACK_ENVIRONMENT_KEY", set: true },
    { name: "FLAGSMITH_OPS_READING_FEATURE_ID", set: false },
    { name: "FLAGSMITH_LANG_KN_SEGMENT_ID", set: false },
  ]);
  assert.equal(connection.changes_via, "memory");
  assert.equal(opsSarvamSchema.parse(JSON.parse(sarvamText)).api_key_set, true);
});

test("the flags of the console: values, defaults, each segment and the in-memory override", async () => {
  const { state, call } = await setup();
  const read = async () => {
    const response = await call("GET", "/api/ops/flags");
    assert.equal(response.status, 200, await response.clone().text());
    return opsFlagsSchema.parse(await response.json());
  };
  const quiet = await read();
  assert.equal(quiet.connection.source, "defaults");
  assert.equal(quiet.flags.length, 10);
  assert.ok(quiet.flags.every(({ is_default }) => is_default));
  assert.deepEqual(
    quiet.segments.map(({ segment, language, from }) => [
      segment,
      language,
      from,
    ]),
    [
      ["lang_kn", "kn-IN", "defaults"],
      ["lang_hi", "hi-IN", "defaults"],
      ["lang_en", "en-IN", "defaults"],
    ],
  );
  assert.deepEqual(quiet.overrides, []);
  assert.equal(quiet.experiment.metric, "order_saved_unedited");

  await state("POST", "/api/ops/trigger");
  const bad = await read();
  const kannada = bad.segments[0];
  assert.equal(kannada?.cfg_sarvam.max_tokens, 256);
  assert.equal(kannada?.cfg_sarvam.reasoning_effort, "medium");
  assert.deepEqual(kannada?.in_memory, ["cfg_sarvam"]);
  assert.deepEqual(bad.segments[1]?.in_memory, []);
  assert.deepEqual(bad.overrides, [
    { segment: "lang_kn", ops_reading: null, cfg_sarvam: incidentSarvam },
  ]);
  await state("POST", "/api/ops/reset");
});

test("reading the flags of the console records no experiment exposure", async () => {
  const base = createDefaultFlags();
  const testApp = createTestApp({
    config: testConfig(),
    flags: {
      ...base,
      forOrder: async (orderId, traits, signal) => ({
        ...(await base.forOrder(orderId, traits, signal)),
        in_experiment: true,
        experiment: { id: 3, variant: "control" },
      }),
    },
  });
  seedStore(testApp.deps.db, { isDemo: true });
  const response = await testApp.app.request("/api/ops/flags", {
    headers: { "X-Demo-Token": demoToken },
  });
  assert.equal(response.status, 200);
  const body = opsFlagsSchema.parse(await response.json());
  assert.ok(body.segments.every(({ in_experiment }) => in_experiment));
  assert.deepEqual(base.exposures, []);
  assert.ok(
    body.experiment.variations.every(({ exposures }) => exposures === 0),
  );
});

test("the Sarvam part of the console: the mode, the saved answers, the calls and the billed units", async () => {
  const { call, read, deps } = await setup();
  assert.equal(await read(hindi, "hi-IN"), "ok");
  deps.metrics.sarvamBilledUnits.inc(
    { api: "translate", unit: "characters" },
    42,
  );
  const response = await call("GET", "/api/ops/sarvam");
  assert.equal(response.status, 200);
  const body = opsSarvamSchema.parse(await response.json());
  assert.equal(body.mode, "recorded");
  assert.equal(body.api_key_set, false);
  const summary = summarizeRecordings(savedRecordings());
  assert.equal(body.recordings.saved, summary.saved);
  assert.equal(body.recordings.placeholders, summary.placeholders);
  const chat = body.calls.find(({ api }) => api === "chat");
  assert.ok(chat !== undefined && chat.calls >= 1 && chat.outcomes.ok >= 1);
  assert.deepEqual(body.billed, [
    { api: "translate", unit: "characters", units: 42 },
  ]);
});
