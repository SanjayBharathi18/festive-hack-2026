import assert from "node:assert/strict";
import { test } from "node:test";
import {
  counterValue,
  failureCases,
  liveDeps,
  testBaseUrl,
} from "./fake-sarvam.ts";
import { translateText } from "./translate.ts";
import { transliterate, transliterateModel } from "./transliterate.ts";

const input = { text: "Mysore pak", source: "en-IN", target: "hi-IN" };

function transliterated(text: string): Response {
  return Response.json({
    request_id: "l1",
    transliterated_text: text,
    source_language_code: "en-IN",
  });
}

test("transliteration sends the text, source and target, and counts characters", async () => {
  const deps = liveDeps([transliterated("मैसूर पाक")]);
  const result = await transliterate(deps, input);
  assert.deepEqual(result, { ok: true, placeholder: false, value: "मैसूर पाक" });
  const [request] = deps.requests;
  assert.equal(request?.url, `${testBaseUrl}/transliterate`);
  assert.deepEqual(await request!.json(), {
    input: "Mysore pak",
    source_language_code: "en-IN",
    target_language_code: "hi-IN",
  });
  assert.equal(
    await counterValue(deps.metrics.sarvamBilledUnits, {
      api: "transliterate",
      unit: "characters",
    }),
    "Mysore pak".length,
  );
  assert.equal(
    await counterValue(deps.metrics.sarvamRequests, {
      api: "transliterate",
      model: transliterateModel,
      language: "hi-IN",
      outcome: "ok",
    }),
    1,
  );
});

test("an empty transliteration is invalid", async () => {
  const deps = liveDeps([transliterated(" ")]);
  assert.deepEqual(await transliterate(deps, input), {
    ok: false,
    outcome: "invalid",
    missing: false,
  });
});

for (const failure of failureCases) {
  test(`transliteration: ${failure.name}`, async () => {
    const deps = liveDeps([...failure.answers()], { transliterate: 30 });
    assert.deepEqual(await transliterate(deps, input), {
      ok: false,
      outcome: failure.outcome,
      missing: false,
    });
    assert.equal(deps.requests.length, failure.requests);
  });
}

test("translateText sends the target and mode it is given", async () => {
  const deps = liveDeps([
    Response.json({ translated_text: "ಕಡಿಮೆ ಸಿಹಿ", source_language_code: "hi-IN" }),
  ]);
  const result = await translateText(deps, {
    text: "कम मीठा",
    model: "mayura:v1",
    source: "auto",
    target: "kn-IN",
    mode: "modern-colloquial",
  });
  assert.deepEqual(result, { ok: true, placeholder: false, value: "ಕಡಿಮೆ ಸಿಹಿ" });
  assert.deepEqual(await deps.requests[0]!.json(), {
    input: "कम मीठा",
    source_language_code: "auto",
    target_language_code: "kn-IN",
    model: "mayura:v1",
    mode: "modern-colloquial",
  });
});
