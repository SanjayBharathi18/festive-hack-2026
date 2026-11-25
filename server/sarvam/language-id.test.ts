import assert from "node:assert/strict";
import { test } from "node:test";
import {
  counterValue,
  failureCases,
  liveDeps,
  retryAfterAnswers,
  testBaseUrl,
} from "./fake-sarvam.ts";
import {
  identifyLanguage,
  languageIdLimit,
  languageIdModel,
} from "./language-id.ts";

const text = "नमस्ते, शनिवार के लिए एक किलो काजू कतली चाहिए।";

function identified(code: string | null): Response {
  return Response.json({
    request_id: "l1",
    language_code: code,
    script_code: "Deva",
  });
}

test("language identification sends the text and gives the language", async () => {
  const deps = liveDeps([identified("hi-IN")]);
  const result = await identifyLanguage(deps, text);
  assert.deepEqual(result, { ok: true, placeholder: false, value: "hi-IN" });
  const [request] = deps.requests;
  assert.equal(request?.url, `${testBaseUrl}/text-lid`);
  assert.deepEqual(await request!.json(), { input: text });
  assert.equal(
    await counterValue(deps.metrics.sarvamRequests, {
      api: "language_id",
      model: languageIdModel,
      language: "hi-IN",
      outcome: "ok",
    }),
    1,
  );
  assert.equal(
    await counterValue(deps.metrics.sarvamBilledUnits, {
      api: "language_id",
      unit: "characters",
    }),
    text.length,
  );
});

test("language identification sends only the first 1,000 characters, cut at a sentence", async () => {
  const long = Array.from({ length: 30 }, () => text).join(" ");
  const deps = liveDeps([identified("hi-IN")]);
  await identifyLanguage(deps, long);
  const { input } = (await deps.requests[0]!.json()) as { input: string };
  assert.ok(input.length <= languageIdLimit);
  assert.ok(input.endsWith("।"));
  assert.ok(long.startsWith(input));
});

test("an unknown language is no language", async () => {
  const deps = liveDeps([identified(null)]);
  assert.deepEqual(await identifyLanguage(deps, text), {
    ok: true,
    placeholder: false,
    value: null,
  });
});

test("language identification retries a 429 after its Retry-After", async () => {
  const deps = liveDeps(retryAfterAnswers(identified("kn-IN")));
  const result = await identifyLanguage(deps, text);
  assert.deepEqual(result.ok && result.value, "kn-IN");
  assert.equal(deps.requests.length, 2);
});

for (const failure of failureCases) {
  test(`language identification: ${failure.name}`, async () => {
    const deps = liveDeps([...failure.answers()], { language_id: 30 });
    const result = await identifyLanguage(deps, text);
    assert.deepEqual(result, {
      ok: false,
      outcome: failure.outcome,
      missing: false,
    });
    assert.equal(deps.requests.length, failure.requests);
  });
}
