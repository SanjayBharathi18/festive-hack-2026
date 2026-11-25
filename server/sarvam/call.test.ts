import assert from "node:assert/strict";
import { test } from "node:test";
import { createMetrics } from "../metrics/metrics.ts";
import type { SarvamAnswer, SarvamRequest, SarvamTransport } from "./api.ts";
import {
  callSarvam,
  languageLabel,
  type Meter,
  type SarvamCall,
} from "./call.ts";
import { counterValue } from "./fake-sarvam.ts";

const request: SarvamRequest = {
  api: "translate",
  model: "mayura:v1",
  input: "ಎರಡು ಕೆಜಿ",
  body: {},
};

function transport(
  answer: SarvamAnswer,
  mode: SarvamTransport["mode"] = "live",
): SarvamTransport {
  return { mode, send: async () => answer };
}

function meter(language: string | null = "kn-IN"): Meter<string> {
  return {
    parse: (body) =>
      typeof body === "string" && body !== ""
        ? { ok: true, value: body }
        : { ok: false, reason: "not a string" },
    language: () => language,
    units: () => ({ characters: 9, nothing: 0 }),
  };
}

function ok(body: unknown, placeholder = false): SarvamAnswer {
  return { ok: true, status: 200, body, placeholder };
}

function failed(
  outcome: Exclude<SarvamAnswer, { ok: true }>["outcome"],
  status: number | null,
  code: string | null = null,
  missing = false,
): SarvamAnswer {
  return { ok: false, outcome, status, code, missing };
}

async function call(
  answer: SarvamAnswer,
  {
    mode,
    language,
  }: { mode?: "live" | "recorded"; language?: string | null } = {},
) {
  const metrics = createMetrics();
  const reports: SarvamCall[] = [];
  const result = await callSarvam(
    {
      sarvam: transport(answer, mode),
      metrics,
      report: (entry) => reports.push(entry),
    },
    request,
    meter(language),
  );
  return { result, metrics, report: reports[0] };
}

test("a valid answer is ok, counted once, timed and billed", async () => {
  const { result, metrics, report } = await call(ok("two kg"));
  assert.deepEqual(result, { ok: true, value: "two kg", placeholder: false });
  const labels = { api: "translate", model: "mayura:v1", language: "kn-IN" };
  assert.equal(
    await counterValue(metrics.sarvamRequests, { ...labels, outcome: "ok" }),
    1,
  );
  const duration = await metrics.sarvamRequestDuration.get();
  assert.ok(
    duration.values.some(
      (value) =>
        value.labels.api === "translate" &&
        value.labels.language === "kn-IN" &&
        value.metricName === "sarvam_request_duration_seconds_count" &&
        value.value === 1,
    ),
  );
  assert.equal(
    await counterValue(metrics.sarvamBilledUnits, {
      api: "translate",
      unit: "characters",
    }),
    9,
  );
  assert.equal(
    await counterValue(metrics.sarvamBilledUnits, { unit: "nothing" }),
    0,
  );
  assert.deepEqual(report && { ...report, seconds: 0 }, {
    api: "translate",
    model: "mayura:v1",
    language: "kn-IN",
    outcome: "ok",
    status: 200,
    reason: null,
    units: { characters: 9 },
    seconds: 0,
    placeholder: false,
  });
});

test("an answer that does not parse is invalid, still billed, with its reason", async () => {
  const { result, metrics, report } = await call(ok(""));
  assert.deepEqual(result, { ok: false, outcome: "invalid", missing: false });
  assert.equal(report?.reason, "not a string");
  assert.equal(
    await counterValue(metrics.sarvamBilledUnits, { unit: "characters" }),
    9,
  );
});

test("a failed call keeps its outcome and its error code, and bills nothing", async () => {
  for (const [answer, outcome, reason] of [
    [
      failed("no_credit", 402, "insufficient_quota_error"),
      "no_credit",
      "insufficient_quota_error",
    ],
    [
      failed("rate_limited", 429, "rate_limit_exceeded_error"),
      "rate_limited",
      "rate_limit_exceeded_error",
    ],
    [failed("timeout", null), "timeout", null],
    [
      failed("error", 500, "internal_server_error"),
      "error",
      "internal_server_error",
    ],
  ] as const) {
    const { result, metrics, report } = await call(answer);
    assert.deepEqual(result, { ok: false, outcome, missing: false });
    assert.equal(report?.reason, reason);
    assert.equal(
      await counterValue(metrics.sarvamRequests, { api: "translate", outcome }),
      1,
    );
    assert.equal(await counterValue(metrics.sarvamBilledUnits, {}), 0);
  }
});

test("a missing recorded answer is an error that says so", async () => {
  const { result, report } = await call(failed("error", null, null, true), {
    mode: "recorded",
  });
  assert.deepEqual(result, { ok: false, outcome: "error", missing: true });
  assert.equal(report?.reason, "no saved answer");
});

test("a recorded answer is counted but not billed, and keeps its placeholder mark", async () => {
  const { result, metrics, report } = await call(ok("two kg", true), {
    mode: "recorded",
  });
  assert.deepEqual(result, { ok: true, value: "two kg", placeholder: true });
  assert.equal(report?.placeholder, true);
  assert.equal(
    await counterValue(metrics.sarvamRequests, { outcome: "ok" }),
    1,
  );
  assert.equal(await counterValue(metrics.sarvamBilledUnits, {}), 0);
});

test("the language label is a supported Sarvam code, unknown, or other", async () => {
  assert.equal(languageLabel("kn-IN"), "kn-IN");
  assert.equal(languageLabel("brx-IN"), "brx-IN");
  assert.equal(languageLabel(null), "unknown");
  assert.equal(languageLabel(undefined), "unknown");
  assert.equal(languageLabel("zz-IN"), "other");
  assert.equal(languageLabel("en-US"), "other");
  for (const language of ["zz-IN", "qqq-IN", null]) {
    const { metrics } = await call(ok("x"), { language });
    const { values } = await metrics.sarvamRequests.get();
    assert.deepEqual(
      values.map(({ labels }) => labels.language),
      [language === null ? "unknown" : "other"],
    );
  }
});
