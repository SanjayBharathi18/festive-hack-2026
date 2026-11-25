import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { chatJson, chatUnits, parseContent, strictJsonSchema } from "./chat.ts";
import {
  counterValue,
  failureCases,
  liveDeps,
  retryAfterAnswers,
  testBaseUrl,
  testKey,
} from "./fake-sarvam.ts";

const schema = z
  .object({ item: z.string(), quantity: z.number().nullable() })
  .refine(({ quantity }) => quantity === null || quantity > 0);

const input = {
  model: "sarvam-105b",
  system: "Read the order.",
  user: "2 kg kaju katli",
  schema,
  schemaName: "order_reading",
  reasoning_effort: null,
  max_tokens: 1024,
  language: "hi-IN",
};

function chatAnswer(content: string | null, finish = "stop") {
  return {
    id: "chat-1",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        finish_reason: finish,
        message: { role: "assistant", content },
      },
    ],
    usage: {
      prompt_tokens: 900,
      completion_tokens: 40,
      total_tokens: 940,
      prompt_tokens_details: { cached_tokens: 300 },
    },
  };
}

const ok = chatAnswer(JSON.stringify({ item: "Kaju katli", quantity: 2 }));

test("chat sends json_schema with strict, and always sends reasoning_effort and max_tokens", async () => {
  const deps = liveDeps([Response.json(ok)]);
  const result = await chatJson(deps, input);
  assert.deepEqual(result, {
    ok: true,
    placeholder: false,
    value: { item: "Kaju katli", quantity: 2 },
  });
  const [request] = deps.requests;
  assert.equal(request?.url, `${testBaseUrl}/v1/chat/completions`);
  assert.equal(request?.headers.get("api-subscription-key"), testKey);
  assert.equal(request?.headers.get("Content-Type"), "application/json");
  const body = (await request!.json()) as Record<string, unknown>;
  assert.equal(body.model, "sarvam-105b");
  assert.deepEqual(body.messages, [
    { role: "system", content: "Read the order." },
    { role: "user", content: "2 kg kaju katli" },
  ]);
  assert.ok("reasoning_effort" in body);
  assert.equal(body.reasoning_effort, null);
  assert.equal(body.max_tokens, 1024);
  assert.deepEqual(body.response_format, {
    type: "json_schema",
    json_schema: {
      name: "order_reading",
      strict: true,
      schema: strictJsonSchema(schema),
    },
  });
});

test("chat sends the reasoning effort from the settings", async () => {
  const deps = liveDeps([Response.json(ok)]);
  await chatJson(deps, {
    ...input,
    reasoning_effort: "medium",
    max_tokens: 256,
  });
  const body = (await deps.requests[0]!.json()) as Record<string, unknown>;
  assert.equal(body.reasoning_effort, "medium");
  assert.equal(body.max_tokens, 256);
});

test("the strict JSON schema lists every field as required and allows no others", () => {
  const jsonSchema = strictJsonSchema(schema);
  assert.equal("$schema" in jsonSchema, false);
  assert.equal(jsonSchema.type, "object");
  assert.equal(jsonSchema.additionalProperties, false);
  assert.deepEqual(jsonSchema.required, ["item", "quantity"]);
});

test("chat bills input, cached input and output tokens", async () => {
  const deps = liveDeps([Response.json(ok)]);
  await chatJson(deps, input);
  const billed = (unit: string) =>
    counterValue(deps.metrics.sarvamBilledUnits, { api: "chat", unit });
  assert.equal(await billed("input_tokens"), 600);
  assert.equal(await billed("cached_input_tokens"), 300);
  assert.equal(await billed("output_tokens"), 40);
  assert.equal(
    await counterValue(deps.metrics.sarvamRequests, {
      api: "chat",
      model: "sarvam-105b",
      language: "hi-IN",
      outcome: "ok",
    }),
    1,
  );
});

test("chat units are empty when the answer has no usage", () => {
  assert.deepEqual(chatUnits({ choices: [] }), {});
  assert.deepEqual(
    chatUnits({ usage: { prompt_tokens: 10, completion_tokens: 2 } }),
    { input_tokens: 10, cached_input_tokens: 0, output_tokens: 2 },
  );
});

test("finish_reason length with empty content is invalid", async () => {
  const deps = liveDeps([Response.json(chatAnswer("", "length"))]);
  const result = await chatJson(deps, input);
  assert.deepEqual(result, { ok: false, outcome: "invalid", missing: false });
  assert.equal(
    await counterValue(deps.metrics.sarvamRequests, {
      api: "chat",
      outcome: "invalid",
    }),
    1,
  );
  assert.equal(
    await counterValue(deps.metrics.sarvamBilledUnits, {
      api: "chat",
      unit: "output_tokens",
    }),
    40,
  );
});

test("each answer that cannot be read is invalid, with its reason", () => {
  const cases: [unknown, string][] = [
    [chatAnswer('{"item":"x","quantity":1}', "length"), "finish_reason length"],
    [chatAnswer(""), "empty content"],
    [chatAnswer(null), "empty content"],
    [chatAnswer("I think it is kaju katli"), "content is not JSON"],
    [
      chatAnswer('{"item":"x","quantity":-1}'),
      "content does not match the schema",
    ],
    [chatAnswer('{"item":"x"}'), "content does not match the schema"],
    [{ choices: [] }, "not a chat answer"],
    ["not an object", "not a chat answer"],
  ];
  for (const [body, reason] of cases) {
    assert.deepEqual(parseContent(body, schema), { ok: false, reason });
  }
});

test("JSON in a code fence is still read", () => {
  assert.deepEqual(
    parseContent(
      chatAnswer('```json\n{"item":"x","quantity":null}\n```'),
      schema,
    ),
    { ok: true, value: { item: "x", quantity: null } },
  );
});

test("chat retries a 429 after its Retry-After", async () => {
  const deps = liveDeps(retryAfterAnswers(Response.json(ok)));
  const result = await chatJson(deps, input);
  assert.equal(result.ok, true);
  assert.equal(deps.requests.length, 2);
});

for (const failure of failureCases) {
  test(`chat: ${failure.name}`, async () => {
    const deps = liveDeps([...failure.answers()], { chat: 30 });
    const result = await chatJson(deps, input);
    assert.deepEqual(result, {
      ok: false,
      outcome: failure.outcome,
      missing: false,
    });
    assert.equal(deps.requests.length, failure.requests);
    assert.equal(
      await counterValue(deps.metrics.sarvamRequests, {
        api: "chat",
        language: "hi-IN",
        outcome: failure.outcome,
      }),
      1,
    );
  });
}
