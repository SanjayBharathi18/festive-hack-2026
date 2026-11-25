import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { formatCheck, runDoctor, type Check } from "./doctor.ts";
import { createVapidKeys } from "./vapid.ts";

type Route = (request: Request) => Response | Promise<Response>;

function fakeFetch(routes: Record<string, Route>) {
  const requests: Request[] = [];
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    const route = routes[request.url];
    if (route === undefined) throw new TypeError("fetch failed");
    return route(request);
  }) as typeof fetch;
  return { send, requests };
}

function folder(): string {
  return mkdtempSync(join(tmpdir(), "doctor-"));
}

function byName(checks: Check[]): Record<string, Check> {
  return Object.fromEntries(checks.map((check) => [check.name, check]));
}

const secret = "doctor-session-secret-of-32-chars";
const sarvamUrl = "https://api.sarvam.ai/v1/chat/completions";
const flagsUrl = "https://edge.api.flagsmith.com/api/v1/flags/";
const organisationsUrl = "https://api.flagsmith.com/api/v1/organisations/";

function liveEnv() {
  const vapid = createVapidKeys();
  return {
    SARVAM_MODE: "live",
    SARVAM_API_KEY: "sk_sarvam_secret_value",
    FLAGSMITH_ENVIRONMENT_KEY: "ser.flagsmith_secret_value",
    FLAGSMITH_ORG_API_KEY: "org_flagsmith_secret_value",
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: "mailto:team@example.com",
    SESSION_SECRET: secret,
    DEMO_DESK_TOKEN: "demo-desk-secret-token",
    PUBLIC_URL: "https://34-12-56-78.sslip.io",
    DATA_DIR: folder(),
  };
}

const sarvamOk: Route = () =>
  Response.json({
    choices: [{ finish_reason: "length", message: { content: "" } }],
    usage: { prompt_tokens: 9, completion_tokens: 1, total_tokens: 10 },
  });

test("with no settings, only the session secret fails and nothing is called", async () => {
  const { send, requests } = fakeFetch({});
  const checks = byName(
    await runDoctor({ env: { DATA_DIR: folder() }, fetch: send }),
  );
  assert.equal(requests.length, 0);
  assert.equal(checks["Configuration"]?.status, "fail");
  assert.equal(checks["Session secret"]?.status, "fail");
  assert.match(
    checks["Session secret"]?.detail ?? "",
    /SESSION_SECRET missing/,
  );
  assert.equal(checks["Data folder"]?.status, "ok");
  for (const name of [
    "Public address",
    "Web push",
    "Demo desk",
    "Sarvam",
    "Flagsmith environment",
    "Flagsmith organisation key",
  ]) {
    assert.equal(checks[name]?.status, "not_set", name);
  }
  assert.match(checks["Sarvam"]?.detail ?? "", /recorded mode only/);
  assert.match(checks["Web push"]?.detail ?? "", /no push/);
});

test("a full live setup calls each service once, and all checks pass", async () => {
  const env = liveEnv();
  const usageLog = join(folder(), "usage.log");
  const { send, requests } = fakeFetch({
    [sarvamUrl]: sarvamOk,
    [flagsUrl]: () => Response.json([{ feature: { name: "ops_voice" } }]),
    [organisationsUrl]: () => Response.json({ results: [{ id: 1 }] }),
  });
  const checks = await runDoctor({ env, fetch: send, usageLog });
  assert.deepEqual(
    checks.filter((check) => check.status !== "ok"),
    [],
  );
  assert.deepEqual(
    requests.map((request) => `${request.method} ${request.url}`),
    [`POST ${sarvamUrl}`, `GET ${flagsUrl}`, `GET ${organisationsUrl}`],
  );
  const [chat, flags, organisations] = requests;
  assert.equal(chat?.headers.get("api-subscription-key"), env.SARVAM_API_KEY);
  assert.deepEqual(await chat?.json(), {
    model: "sarvam-105b",
    messages: [{ role: "user", content: "Hi" }],
    max_tokens: 1,
    reasoning_effort: null,
  });
  assert.equal(
    flags?.headers.get("X-Environment-Key"),
    env.FLAGSMITH_ENVIRONMENT_KEY,
  );
  assert.equal(
    organisations?.headers.get("Authorization"),
    `Api-Key ${env.FLAGSMITH_ORG_API_KEY}`,
  );
  const output = checks.map(formatCheck).join("\n");
  for (const value of [
    env.SARVAM_API_KEY,
    env.FLAGSMITH_ENVIRONMENT_KEY,
    env.FLAGSMITH_ORG_API_KEY,
    env.VAPID_PRIVATE_KEY,
    env.SESSION_SECRET,
    env.DEMO_DESK_TOKEN,
  ]) {
    assert.equal(output.includes(value), false, "a secret is in the output");
  }
  const log = readFileSync(usageLog, "utf8");
  assert.match(log, /^# chat input_tokens: 9$/m);
  assert.match(log, /"script":"doctor"/);
  assert.equal(log.includes(env.SARVAM_API_KEY), false);
});

test("each Sarvam failure says what to do next", async () => {
  const cases: [Route, RegExp][] = [
    [
      () => new Response(null, { status: 403 }),
      /key was refused.*key-management/,
    ],
    [
      () =>
        Response.json(
          { error: { code: "insufficient_quota_error" } },
          { status: 402 },
        ),
      /no credit left/,
    ],
    [
      () =>
        Response.json(
          { error: { code: "seat_budget_exhausted_error" } },
          { status: 429 },
        ),
      /no credit left/,
    ],
    [
      () =>
        Response.json(
          { error: { code: "rate_limit_exceeded_error" } },
          { status: 429 },
        ),
      /rate limited.*wait a minute/,
    ],
    [() => new Response(null, { status: 503 }), /answered 503.*try again/],
  ];
  for (const [route, expected] of cases) {
    const { send } = fakeFetch({ [sarvamUrl]: route });
    const checks = byName(
      await runDoctor({
        env: {
          ...liveEnv(),
          FLAGSMITH_ENVIRONMENT_KEY: "",
          FLAGSMITH_ORG_API_KEY: "",
        },
        fetch: send,
        usageLog: join(folder(), "usage.log"),
      }),
    );
    assert.equal(checks["Sarvam"]?.status, "fail");
    assert.match(checks["Sarvam"]?.detail ?? "", expected);
  }
});

test("a Sarvam timeout and a network error are failures with a next step", async (t) => {
  const keepAlive = setInterval(() => {}, 10);
  t.after(() => clearInterval(keepAlive));
  const env = {
    ...liveEnv(),
    FLAGSMITH_ENVIRONMENT_KEY: "",
    FLAGSMITH_ORG_API_KEY: "",
  };
  const hanging = fakeFetch({
    [sarvamUrl]: (request) =>
      new Promise((_, reject) =>
        request.signal.addEventListener("abort", () =>
          reject(request.signal.reason),
        ),
      ),
  });
  const slow = byName(
    await runDoctor({
      env,
      fetch: hanging.send,
      timeoutMs: 20,
      usageLog: join(folder(), "usage.log"),
    }),
  );
  assert.match(slow["Sarvam"]?.detail ?? "", /no answer within 0\.02 s/);
  const unreachable = byName(
    await runDoctor({
      env: { ...env, SARVAM_BASE_URL: "https://sarvam.invalid" },
      fetch: fakeFetch({}).send,
      usageLog: join(folder(), "usage.log"),
    }),
  );
  assert.match(
    unreachable["Sarvam"]?.detail ?? "",
    /cannot reach https:\/\/sarvam\.invalid/,
  );
});

test("recorded mode makes no Sarvam call", async () => {
  const { send, requests } = fakeFetch({});
  const checks = byName(
    await runDoctor({
      env: {
        SESSION_SECRET: secret,
        SARVAM_API_KEY: "sk_sarvam_secret_value",
        DATA_DIR: folder(),
      },
      fetch: send,
    }),
  );
  assert.equal(requests.length, 0);
  assert.equal(checks["Sarvam"]?.status, "ok");
  assert.match(checks["Sarvam"]?.detail ?? "", /recorded mode, so no call/);
});

test("refused Flagsmith keys name the key to fix", async () => {
  const { send } = fakeFetch({
    [flagsUrl]: () => new Response(null, { status: 401 }),
    [organisationsUrl]: () => new Response(null, { status: 403 }),
  });
  const checks = byName(
    await runDoctor({
      env: { ...liveEnv(), SARVAM_MODE: "recorded" },
      fetch: send,
    }),
  );
  assert.equal(checks["Flagsmith environment"]?.status, "fail");
  assert.match(
    checks["Flagsmith environment"]?.detail ?? "",
    /FLAGSMITH_ENVIRONMENT_KEY/,
  );
  assert.equal(checks["Flagsmith organisation key"]?.status, "fail");
  assert.match(
    checks["Flagsmith organisation key"]?.detail ?? "",
    /Organisation Settings, API Access/,
  );
});

test("FLAGSMITH_API_URL and FLAGSMITH_ADMIN_API_URL replace the two Flagsmith addresses", async () => {
  const base = "https://edge.flagsmith.example.com/api/v1";
  const admin = "https://flagsmith.example.com/api/v1";
  const { send, requests } = fakeFetch({
    [`${base}/flags/`]: () => Response.json([]),
    [`${admin}/organisations/`]: () => Response.json([]),
  });
  await runDoctor({
    env: {
      ...liveEnv(),
      SARVAM_MODE: "recorded",
      FLAGSMITH_API_URL: base,
      FLAGSMITH_ADMIN_API_URL: admin,
    },
    fetch: send,
  });
  assert.deepEqual(
    requests.map((request) => request.url),
    [`${base}/flags/`, `${admin}/organisations/`],
  );
});

test("the public address must use HTTPS, except on localhost", async () => {
  const cases: [string, string][] = [
    ["https://34-12-56-78.sslip.io", "ok"],
    ["http://localhost:8080", "ok"],
    ["http://34.12.56.78", "fail"],
  ];
  for (const [url, status] of cases) {
    const checks = byName(
      await runDoctor({
        env: { SESSION_SECRET: secret, PUBLIC_URL: url, DATA_DIR: folder() },
        fetch: fakeFetch({}).send,
      }),
    );
    assert.equal(checks["Public address"]?.status, status, url);
  }
});

test("bad VAPID keys and a folder that cannot be written fail", async () => {
  const file = join(folder(), "a-file");
  writeFileSync(file, "");
  const checks = byName(
    await runDoctor({
      env: {
        SESSION_SECRET: secret,
        VAPID_PUBLIC_KEY: createVapidKeys().publicKey,
        DATA_DIR: join(file, "data"),
      },
      fetch: fakeFetch({}).send,
    }),
  );
  assert.equal(checks["Web push"]?.status, "fail");
  assert.match(checks["Web push"]?.detail ?? "", /VAPID_PRIVATE_KEY missing/);
  assert.equal(checks["Data folder"]?.status, "fail");
  assert.match(checks["Data folder"]?.detail ?? "", /not writable \(ENOTDIR\)/);
});

test("a wrong variable that no check covers fails the configuration line", async () => {
  const checks = byName(
    await runDoctor({
      env: { SESSION_SECRET: secret, PORT: "eighty", DATA_DIR: folder() },
      fetch: fakeFetch({}).send,
    }),
  );
  assert.equal(checks["Configuration"]?.status, "fail");
  assert.match(
    checks["Configuration"]?.detail ?? "",
    /PORT must be a whole number from 1 to 65535/,
  );
});

test("each line starts with its status", () => {
  assert.equal(
    formatCheck({
      status: "not_set",
      name: "Demo desk",
      detail: "no demo desk",
    }),
    "NOT SET  Demo desk: no demo desk",
  );
  assert.equal(
    formatCheck({
      status: "ok",
      name: "Data folder",
      detail: "./data is writable",
    }),
    "OK       Data folder: ./data is writable",
  );
});
