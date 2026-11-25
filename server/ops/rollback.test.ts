import assert from "node:assert/strict";
import { test } from "node:test";
import {
  rollbackRequest,
  rollbackSettings,
  sendRollback,
  type RollbackSettings,
} from "./rollback.ts";

const settings: RollbackSettings = {
  adminUrl: "https://api.flagsmith.com/api/v1/",
  orgKey: "org-secret",
  environmentKey: "Env1Key",
  featureId: 101,
  segmentId: 202,
};

test("the request is the PATCH of nudgebee/rollback-lang-kn.yaml", () => {
  const { url, init } = rollbackRequest(settings);
  assert.equal(
    url,
    "https://api.flagsmith.com/api/__future__/environments/Env1Key/features/101/",
  );
  assert.equal(init.method, "PATCH");
  assert.deepEqual(init.headers, {
    Authorization: "Api-Key org-secret",
    "Content-Type": "application/json",
  });
  assert.deepEqual(JSON.parse(String(init.body)), {
    segment_overrides: [
      { segment: { id: 202 }, value: { type: "string", value: "safe" } },
    ],
  });
  assert.equal(
    rollbackRequest({ ...settings, adminUrl: "https://flagsmith.test/api/v1" })
      .url,
    "https://flagsmith.test/api/__future__/environments/Env1Key/features/101/",
  );
});

test("the settings need the flags key, the organisation key and the three values", () => {
  const config = {
    FLAGSMITH_ENVIRONMENT_KEY: "ser.key",
    FLAGSMITH_ADMIN_API_URL: undefined,
    FLAGSMITH_ORG_API_KEY: "org-secret",
    FLAGSMITH_ROLLBACK_ENVIRONMENT_KEY: "Env1Key",
    FLAGSMITH_OPS_READING_FEATURE_ID: 101,
    FLAGSMITH_LANG_KN_SEGMENT_ID: 202,
  };
  assert.deepEqual(rollbackSettings(config), settings);
  for (const name of Object.keys(config) as (keyof typeof config)[]) {
    if (name === "FLAGSMITH_ADMIN_API_URL") continue;
    assert.equal(
      rollbackSettings({ ...config, [name]: undefined }),
      undefined,
      name,
    );
  }
});

test("sendRollback answers ok on 200, and gives the status of a refusal", async () => {
  const calls: Request[] = [];
  const answer = (status: number) =>
    (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(new Request(input, init));
      return new Response("{}", { status });
    }) as typeof fetch;
  assert.deepEqual(await sendRollback(settings, { fetch: answer(200) }), {
    ok: true,
  });
  assert.deepEqual(await sendRollback(settings, { fetch: answer(403) }), {
    ok: false,
    status: 403,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.method, "PATCH");
});

test("sendRollback retries a 503, then gives up after 3 tries", async () => {
  let calls = 0;
  const busy = (async () => {
    calls += 1;
    return new Response("{}", { status: 503 });
  }) as typeof fetch;
  assert.deepEqual(
    await sendRollback(settings, { fetch: busy, baseDelayMs: 1 }),
    {
      ok: false,
      status: 503,
    },
  );
  assert.equal(calls, 3);
});

test("sendRollback gives no status when the network fails", async () => {
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  assert.deepEqual(await sendRollback(settings, { fetch: down }), {
    ok: false,
    status: null,
  });
});
