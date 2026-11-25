import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { z } from "zod";
import { readingSchema } from "../reading/prompt.ts";
import { createMetrics } from "../metrics/metrics.ts";
import type { SarvamRequest } from "./api.ts";
import { chatJson, parseContent } from "./chat.ts";
import { counterValue } from "./fake-sarvam.ts";
import {
  createRecordedTransport,
  fixturesDir,
  inputHash,
  isTestOnly,
  loadRecordings,
  pickRecording,
  savedRecordings,
  summarizeRecordings,
  type Recording,
} from "./recorded.ts";

function recording(input: string, extra: Partial<Recording> = {}): Recording {
  return {
    api: "chat",
    model: "sarvam-105b",
    input_sha256: inputHash(input),
    input,
    placeholder: false,
    response: { answer: input },
    ...extra,
  };
}

function chatRequest(input: string, settings = {}): SarvamRequest {
  return { api: "chat", model: "sarvam-105b", input, settings, body: {} };
}

test("a saved answer is found by the SHA-256 of the text, with the API and the model", async () => {
  const sarvam = createRecordedTransport([recording("2 kg kaju katli")]);
  assert.equal(sarvam.mode, "recorded");
  assert.deepEqual(await sarvam.send(chatRequest("2 kg kaju katli")), {
    ok: true,
    status: 200,
    body: { answer: "2 kg kaju katli" },
    placeholder: false,
  });
  const missing = {
    ok: false,
    outcome: "error",
    status: null,
    code: null,
    missing: true,
  };
  assert.deepEqual(await sarvam.send(chatRequest("3 kg kaju katli")), missing);
  assert.deepEqual(
    await sarvam.send({ ...chatRequest("2 kg kaju katli"), model: "other" }),
    missing,
  );
  assert.deepEqual(
    await sarvam.send({ ...chatRequest("2 kg kaju katli"), api: "translate" }),
    missing,
  );
});

test("a WAV part is found by the SHA-256 of its bytes", async () => {
  const audio = new Uint8Array([1, 2, 3, 4]);
  const sarvam = createRecordedTransport([
    {
      ...recording("audio/part.wav", {
        api: "speech_to_text",
        model: "saaras:v4",
      }),
      input_sha256: inputHash(audio),
    },
  ]);
  const answer = await sarvam.send({
    api: "speech_to_text",
    model: "saaras:v4",
    input: audio,
    body: new FormData(),
  });
  assert.equal(answer.ok, true);
});

test("an answer saved for some settings wins when the settings match, and the plain answer covers the rest", () => {
  const plain = recording("ಚಕ್ಕುಲಿ");
  const cutOff = recording("ಚಕ್ಕುಲಿ", {
    when: { reasoning_effort: "medium", max_tokens: 256 },
  });
  const tokensOnly = recording("ಚಕ್ಕುಲಿ", { when: { max_tokens: 256 } });
  const candidates = [plain, cutOff, tokensOnly];
  assert.equal(
    pickRecording(candidates, { reasoning_effort: "medium", max_tokens: 256 }),
    cutOff,
  );
  assert.equal(
    pickRecording(candidates, { reasoning_effort: null, max_tokens: 256 }),
    tokensOnly,
  );
  assert.equal(
    pickRecording(candidates, { reasoning_effort: null, max_tokens: 1024 }),
    plain,
  );
  assert.equal(pickRecording([cutOff], { max_tokens: 1024 }), undefined);
});

test("a replayed answer is a copy, and keeps its placeholder mark", async () => {
  const sarvam = createRecordedTransport([
    recording("x", { placeholder: true }),
  ]);
  const first = await sarvam.send(chatRequest("x"));
  assert.ok(first.ok && first.placeholder);
  (first.body as { answer: string }).answer = "changed";
  const second = await sarvam.send(chatRequest("x"));
  assert.deepEqual(second.ok && second.body, { answer: "x" });
});

test("a recorded call is counted, but bills nothing", async () => {
  const content = JSON.stringify({ item: "x" });
  const sarvam = createRecordedTransport([
    recording("x", {
      response: {
        choices: [{ finish_reason: "stop", message: { content } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    }),
  ]);
  const metrics = createMetrics();
  const result = await chatJson(
    { sarvam, metrics },
    {
      model: "sarvam-105b",
      system: "",
      user: "x",
      schema: z.object({ item: z.string() }),
      schemaName: "test",
      reasoning_effort: null,
      max_tokens: 1024,
      language: null,
    },
  );
  assert.equal(result.ok, true);
  assert.equal(
    await counterValue(metrics.sarvamRequests, { api: "chat", outcome: "ok" }),
    1,
  );
  assert.equal(await counterValue(metrics.sarvamBilledUnits, {}), 0);
});

test("the saved answers match their inputs, so each one can be found", () => {
  for (const saved of savedRecordings()) {
    const input = saved.input.startsWith("audio/")
      ? readFileSync(new URL(saved.input, fixturesDir))
      : saved.input;
    assert.equal(saved.input_sha256, inputHash(input), saved.input);
  }
});

test("each voice line has a saved language and reading, and each reading is valid", () => {
  const recordings = savedRecordings();
  const lines = JSON.parse(
    readFileSync(new URL("voice-lines.json", fixturesDir), "utf8"),
  ) as { id: string; text: string }[];
  assert.equal(lines.length, 20);
  for (const { id, text } of lines) {
    const saved = (api: string) =>
      recordings.find(
        (entry) => entry.api === api && entry.input === text && !entry.when,
      );
    assert.ok(saved("language_id"), `${id} language`);
    const reading = saved("chat");
    assert.ok(reading, `${id} reading`);
    assert.equal(parseContent(reading.response, readingSchema).ok, true, id);
  }
});

test("the saved invalid answers stay invalid", () => {
  const recordings = savedRecordings();
  const invalid = recordings.filter(
    (entry) => entry.input.startsWith("TEST ") || entry.when !== undefined,
  );
  assert.ok(invalid.length >= 2);
  for (const entry of invalid) {
    assert.equal(parseContent(entry.response, readingSchema).ok, false);
  }
  const reasons = invalid.map(({ response }) => {
    const result = parseContent(response, readingSchema);
    return result.ok ? "ok" : result.reason;
  });
  assert.ok(reasons.includes("finish_reason length"));
  assert.ok(reasons.includes("empty content"));
});

test("the summary counts the placeholders that a real order can reach, apart from test answers", () => {
  assert.deepEqual(
    summarizeRecordings([
      recording("a", { placeholder: true }),
      recording("b"),
      recording("c", { placeholder: true }),
      recording("TEST empty answer", { placeholder: true }),
      recording("audio/synthetic-VK1.wav", { placeholder: true }),
    ]),
    { saved: 5, placeholders: 2, test_only: 2 },
  );
  const summary = summarizeRecordings(savedRecordings());
  assert.ok(summary.saved > 0);
  assert.ok(summary.placeholders + summary.test_only <= summary.saved);
  assert.equal(isTestOnly({ input: "audio/VK1.wav" }), false);
});

test("a folder with no answer files has no saved answers", () => {
  const dir = mkdtempSync(join(tmpdir(), "recorded-"));
  assert.deepEqual(loadRecordings(pathToFileURL(`${dir}/`)), []);
});

test("a broken answer file is named", () => {
  const dir = mkdtempSync(join(tmpdir(), "recorded-"));
  writeFileSync(join(dir, "chat.json"), "[{");
  assert.throws(
    () => loadRecordings(pathToFileURL(`${dir}/`)),
    /chat\.json is not JSON/,
  );
  writeFileSync(join(dir, "chat.json"), JSON.stringify([{ api: "chat" }]));
  assert.throws(
    () => loadRecordings(pathToFileURL(`${dir}/`)),
    /chat\.json is not a list of saved Sarvam answers/,
  );
});
