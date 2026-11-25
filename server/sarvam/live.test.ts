import assert from "node:assert/strict";
import { test } from "node:test";
import type { SarvamRequest } from "./api.ts";
import {
  fakeFetch,
  hangUntilAborted,
  sarvamError,
  testBaseUrl,
} from "./fake-sarvam.ts";
import { createLiveTransport, failedOutcome } from "./live.ts";

const request: SarvamRequest = {
  api: "language_id",
  model: "text-lid",
  input: "hello",
  body: { input: "hello" },
};

function transport(answers: Parameters<typeof fakeFetch>[0]) {
  const fake = fakeFetch(answers);
  return {
    ...fake,
    sarvam: createLiveTransport({
      baseUrl: `${testBaseUrl}/`,
      apiKey: "sk_test",
      fetch: fake.send,
      timeouts: { language_id: 30 },
      baseDelayMs: 1,
    }),
  };
}

test("each failed status gets its outcome", () => {
  assert.equal(failedOutcome(402, "insufficient_quota_error"), "no_credit");
  assert.equal(failedOutcome(429, "seat_budget_exhausted_error"), "no_credit");
  assert.equal(failedOutcome(429, "rate_limit_exceeded_error"), "rate_limited");
  assert.equal(failedOutcome(429, "audio_duration_busy_error"), "rate_limited");
  assert.equal(failedOutcome(503, "rate_limit_exceeded_error"), "rate_limited");
  assert.equal(failedOutcome(503, "model_overloaded"), "error");
  assert.equal(failedOutcome(403, "invalid_api_key_error"), "error");
  assert.equal(failedOutcome(500, null), "error");
});

test("a 200 answer gives its JSON body, from the base URL without a double slash", async () => {
  const { sarvam, requests } = transport([Response.json({ ok: 1 })]);
  assert.deepEqual(await sarvam.send(request), {
    ok: true,
    status: 200,
    body: { ok: 1 },
    placeholder: false,
  });
  assert.equal(requests[0]?.url, `${testBaseUrl}/text-lid`);
});

test("a failed answer keeps its status and error code", async () => {
  const { sarvam } = transport([sarvamError(403, "invalid_api_key_error")]);
  assert.deepEqual(await sarvam.send(request), {
    ok: false,
    outcome: "error",
    status: 403,
    code: "invalid_api_key_error",
    missing: false,
  });
});

test("a 503 is retried, and a 503 with rate_limit_exceeded_error is rate_limited", async () => {
  const { sarvam, requests } = transport(
    [1, 2, 3].map(() => sarvamError(503, "rate_limit_exceeded_error")),
  );
  const answer = await sarvam.send(request);
  assert.equal(answer.ok === false && answer.outcome, "rate_limited");
  assert.equal(requests.length, 3);
});

test("a network failure is an error", async () => {
  const sarvam = createLiveTransport({
    baseUrl: testBaseUrl,
    apiKey: "sk_test",
    fetch: (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch,
  });
  assert.deepEqual(await sarvam.send(request), {
    ok: false,
    outcome: "error",
    status: null,
    code: null,
    missing: false,
  });
});

test("a cancelled request throws, so that no outcome is counted", async () => {
  const { sarvam } = transport([hangUntilAborted]);
  const controller = new AbortController();
  const sent = sarvam.send(request, controller.signal);
  controller.abort();
  await assert.rejects(sent, { name: "AbortError" });
});

test("a JSON body has a JSON content type, and a form has its own", async () => {
  const { sarvam, requests } = transport([
    Response.json({}),
    Response.json({}),
  ]);
  await sarvam.send(request);
  const form = new FormData();
  form.append("model", "saaras:v4");
  await sarvam.send({ ...request, api: "speech_to_text", body: form });
  assert.equal(requests[0]?.headers.get("Content-Type"), "application/json");
  assert.match(
    requests[1]?.headers.get("Content-Type") ?? "",
    /^multipart\/form-data; boundary=/,
  );
});
