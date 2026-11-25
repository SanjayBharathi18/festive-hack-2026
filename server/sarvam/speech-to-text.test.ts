import assert from "node:assert/strict";
import { test } from "node:test";
import {
  counterValue,
  failureCases,
  liveDeps,
  retryAfterAnswers,
  testBaseUrl,
  testKey,
} from "./fake-sarvam.ts";
import { speechToText } from "./speech-to-text.ts";

const audio = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
const input = {
  audio,
  seconds: 4.5,
  model: "saaras:v4",
  mode: "codemix",
  keyterms: ["ಮೈಸೂರು ಪಾಕ್", "Mysore pak"],
};
const answer = {
  request_id: "20261124_test",
  transcript: " ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್ ",
  language_code: "kn-IN",
  language_probability: 0.93,
};

test("speech to text sends the WAV part, the mode and the keyterms, and no language_code", async () => {
  const deps = liveDeps([Response.json(answer)]);
  const result = await speechToText(deps, input);
  assert.deepEqual(result, {
    ok: true,
    placeholder: false,
    value: {
      transcript: "ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್",
      language: "kn-IN",
      probability: 0.93,
    },
  });
  const [request] = deps.requests;
  assert.equal(request?.url, `${testBaseUrl}/speech-to-text`);
  assert.equal(request?.method, "POST");
  assert.equal(request?.headers.get("api-subscription-key"), testKey);
  const form = await request!.formData();
  const file = form.get("file");
  assert.ok(file instanceof File);
  assert.equal(file.type, "audio/wav");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), audio);
  assert.equal(form.get("model"), "saaras:v4");
  assert.equal(form.get("mode"), "codemix");
  assert.equal(form.has("language_code"), false);
  assert.deepEqual(JSON.parse(String(form.get("keyterms"))), input.keyterms);
});

test("speech to text counts the call and bills the audio seconds", async () => {
  const deps = liveDeps([Response.json(answer)]);
  await speechToText(deps, input);
  const labels = { api: "speech_to_text", model: "saaras:v4" };
  assert.equal(
    await counterValue(deps.metrics.sarvamRequests, {
      ...labels,
      language: "kn-IN",
      outcome: "ok",
    }),
    1,
  );
  assert.equal(
    await counterValue(deps.metrics.sarvamBilledUnits, {
      api: "speech_to_text",
      unit: "audio_seconds",
    }),
    4.5,
  );
  const duration = await deps.metrics.sarvamRequestDuration.get();
  assert.ok(
    duration.values.some(
      (value) =>
        value.labels.api === "speech_to_text" &&
        value.labels.language === "kn-IN",
    ),
  );
});

test("speech to text with no keyterms sends no keyterms field", async () => {
  const deps = liveDeps([Response.json(answer)]);
  await speechToText(deps, { ...input, keyterms: [] });
  const form = await deps.requests[0]!.formData();
  assert.equal(form.has("keyterms"), false);
});

test("speech to text retries a 429 after its Retry-After", async () => {
  const deps = liveDeps(retryAfterAnswers(Response.json(answer)));
  const result = await speechToText(deps, input);
  assert.equal(result.ok, true);
  assert.equal(deps.requests.length, 2);
});

test("a language code that is not a Sarvam code becomes no language", async () => {
  const deps = liveDeps([
    Response.json({
      ...answer,
      language_code: null,
      language_probability: null,
    }),
  ]);
  const result = await speechToText(deps, input);
  assert.deepEqual(result.ok && result.value.language, null);
  assert.equal(
    await counterValue(deps.metrics.sarvamRequests, {
      api: "speech_to_text",
      language: "unknown",
      outcome: "ok",
    }),
    1,
  );
});

test("an answer with no transcript is invalid", async () => {
  const deps = liveDeps([Response.json({ request_id: "x" })]);
  const result = await speechToText(deps, input);
  assert.deepEqual(result, { ok: false, outcome: "invalid", missing: false });
});

for (const failure of failureCases) {
  test(`speech to text: ${failure.name}`, async () => {
    const deps = liveDeps([...failure.answers()], { speech_to_text: 30 });
    const result = await speechToText(deps, input);
    assert.deepEqual(result, {
      ok: false,
      outcome: failure.outcome,
      missing: false,
    });
    assert.equal(deps.requests.length, failure.requests);
    assert.equal(
      await counterValue(deps.metrics.sarvamRequests, {
        api: "speech_to_text",
        outcome: failure.outcome,
      }),
      1,
    );
    assert.equal(
      await counterValue(deps.metrics.sarvamBilledUnits, {
        api: "speech_to_text",
      }),
      failure.outcome === "invalid" ? 4.5 : 0,
    );
  });
}

test("a language code that Sarvam does not list becomes no language, with the unknown label", async () => {
  const deps = liveDeps([Response.json({ ...answer, language_code: "zz-IN" })]);
  const result = await speechToText(deps, input);
  assert.equal(result.ok && result.value.language, null);
  const { values } = await deps.metrics.sarvamRequests.get();
  assert.deepEqual(
    values.map(({ labels }) => labels.language),
    ["unknown"],
  );
});
