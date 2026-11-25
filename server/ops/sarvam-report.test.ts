import assert from "node:assert/strict";
import { test } from "node:test";
import { outcomes } from "../metrics/metrics.ts";
import { sarvamOutcomeSchema } from "../../shared/ops.ts";
import type { Recording } from "../sarvam/recorded.ts";
import { billedRows, callRows, recordingCounts } from "./sarvam-report.ts";

test("the shared outcomes are the outcomes of the metrics", () => {
  assert.deepEqual(sarvamOutcomeSchema.options, [...outcomes]);
});

test("the call rows sum each API and model by outcome", () => {
  const rows = callRows([
    {
      labels: { api: "chat", model: "m", language: "kn-IN", outcome: "ok" },
      value: 2,
    },
    {
      labels: {
        api: "chat",
        model: "m",
        language: "hi-IN",
        outcome: "invalid",
      },
      value: 1,
    },
    {
      labels: { api: "speech_to_text", model: "s", outcome: "timeout" },
      value: 1,
    },
    { labels: { api: "translate", model: "t", outcome: "ok" }, value: 0 },
  ]);
  assert.deepEqual(
    rows.map(({ api, model, calls }) => [api, model, calls]),
    [
      ["speech_to_text", "s", 1],
      ["chat", "m", 3],
    ],
  );
  assert.deepEqual(rows[1]?.outcomes, {
    ok: 2,
    invalid: 1,
    rate_limited: 0,
    no_credit: 0,
    error: 0,
    timeout: 0,
  });
});

test("the billed rows sum each API and unit", () => {
  assert.deepEqual(
    billedRows([
      { labels: { api: "translate", unit: "characters" }, value: 40 },
      { labels: { api: "translate", unit: "characters" }, value: 2 },
      { labels: { api: "chat", unit: "tokens" }, value: 0 },
    ]),
    [{ api: "translate", unit: "characters", units: 42 }],
  );
});

test("the recording counts split the saved answers by API", () => {
  const recording = (
    api: Recording["api"],
    placeholder: boolean,
    input = "x",
  ) =>
    ({
      api,
      model: "m",
      input_sha256: "0".repeat(64),
      input,
      placeholder,
      response: {},
    }) satisfies Recording;
  const counts = recordingCounts([
    recording("chat", true),
    recording("chat", false),
    recording("translate", true, "TEST only"),
  ]);
  assert.deepEqual(
    { ...counts, by_api: counts.by_api.filter(({ saved }) => saved > 0) },
    {
      saved: 3,
      placeholders: 1,
      test_only: 1,
      by_api: [
        { api: "chat", saved: 2, placeholders: 1 },
        { api: "translate", saved: 1, placeholders: 0 },
      ],
    },
  );
});
