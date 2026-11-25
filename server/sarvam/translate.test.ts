import assert from "node:assert/strict";
import { test } from "node:test";
import {
  counterValue,
  failureCases,
  liveDeps,
  retryAfterAnswers,
  sarvamError,
  testBaseUrl,
} from "./fake-sarvam.ts";
import { translateLimit, translateToEnglish } from "./translate.ts";

const input = {
  text: "ಭಾನುವಾರ ಎರಡು ಕೆಜಿ ಕಾಜು ಕಟ್ಲಿ ಬೇಕು.",
  model: "mayura:v1",
  language: "kn-IN",
};

function translated(text: string): Response {
  return Response.json({
    request_id: "t1",
    translated_text: text,
    source_language_code: "kn-IN",
  });
}

test("translation sends mayura with source auto, target en-IN and mode code-mixed", async () => {
  const deps = liveDeps([translated("I need two kg of kaju katli on Sunday.")]);
  const result = await translateToEnglish(deps, input);
  assert.deepEqual(result, {
    ok: true,
    placeholder: false,
    value: "I need two kg of kaju katli on Sunday.",
  });
  const [request] = deps.requests;
  assert.equal(request?.url, `${testBaseUrl}/translate`);
  assert.deepEqual(await request!.json(), {
    input: input.text,
    source_language_code: "auto",
    target_language_code: "en-IN",
    model: "mayura:v1",
    mode: "code-mixed",
  });
  assert.equal(
    await counterValue(deps.metrics.sarvamBilledUnits, {
      api: "translate",
      unit: "characters",
    }),
    input.text.length,
  );
  assert.equal(
    await counterValue(deps.metrics.sarvamRequests, {
      api: "translate",
      model: "mayura:v1",
      language: "kn-IN",
      outcome: "ok",
    }),
    1,
  );
});

test("text of more than 1,000 characters goes in parts that end at sentences", async () => {
  const sentence = `${"ಚಕ್ಕುಲಿ ".repeat(40).trim()}.`;
  const text = Array.from({ length: 8 }, () => sentence).join(" ");
  assert.ok(text.length > 2 * translateLimit);
  const deps = liveDeps(
    Array.from({ length: 4 }, (_, index) => translated(`part ${index + 1}`)),
  );
  const result = await translateToEnglish(deps, { ...input, text });
  const inputs = await Promise.all(
    deps.requests.map(
      async (request) => ((await request.json()) as { input: string }).input,
    ),
  );
  assert.equal(inputs.length, 3);
  for (const chunk of inputs) {
    assert.ok(chunk.length <= translateLimit);
    assert.ok(chunk.endsWith("."));
  }
  assert.equal(inputs.join(" "), text);
  assert.deepEqual(result, {
    ok: true,
    placeholder: false,
    value: "part 1 part 2 part 3",
  });
});

test("when one part fails, the translation fails", async () => {
  const text = Array.from({ length: 4 }, () => `${"a".repeat(400)}.`).join(" ");
  const deps = liveDeps([
    translated("one"),
    sarvamError(402, "insufficient_quota_error"),
  ]);
  const result = await translateToEnglish(deps, { ...input, text });
  assert.deepEqual(result, { ok: false, outcome: "no_credit", missing: false });
});

test("an empty translation is invalid", async () => {
  const deps = liveDeps([translated("  ")]);
  const result = await translateToEnglish(deps, input);
  assert.deepEqual(result, { ok: false, outcome: "invalid", missing: false });
});

test("translation retries a 429 after its Retry-After", async () => {
  const deps = liveDeps(retryAfterAnswers(translated("Sunday, two kg.")));
  const result = await translateToEnglish(deps, input);
  assert.equal(result.ok, true);
  assert.equal(deps.requests.length, 2);
});

for (const failure of failureCases) {
  test(`translation: ${failure.name}`, async () => {
    const deps = liveDeps([...failure.answers()], { translate: 30 });
    const result = await translateToEnglish(deps, input);
    assert.deepEqual(result, {
      ok: false,
      outcome: failure.outcome,
      missing: false,
    });
    assert.equal(deps.requests.length, failure.requests);
  });
}
