import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "../test-app.ts";
import { createMetrics } from "./metrics.ts";

const documented: Record<string, string[]> = {
  http_requests_total: ["route", "method", "status"],
  http_request_duration_seconds: ["route"],
  sarvam_requests_total: ["api", "model", "language", "outcome"],
  sarvam_request_duration_seconds: ["api", "model", "language"],
  sarvam_billed_units_total: ["api", "unit"],
  reading_results_total: ["language", "variant", "path", "outcome"],
  orders_created_total: ["source", "language", "variant", "edited"],
  quote_requests_total: ["kind"],
  push_sent_total: ["outcome"],
};

function labelsOf(exposition: string, name: string): string[] {
  const sample = exposition
    .split("\n")
    .find((line) => line.startsWith(`${name}{`) && !line.includes('le="'));
  const labels = /\{(.*)\}/.exec(sample ?? "")?.[1] ?? "";
  return [...labels.matchAll(/(\w+)="/g)].map((match) => match[1] ?? "");
}

test("the registry has every documented metric, with its labels", async () => {
  const metrics = createMetrics();
  metrics.httpRequests.inc({
    route: "/o/:token",
    method: "GET",
    status: "200",
  });
  metrics.httpRequestDuration.observe({ route: "/o/:token" }, 0.2);
  metrics.sarvamRequests.inc({
    api: "speech_to_text",
    model: "saaras:v4",
    language: "kn-IN",
    outcome: "ok",
  });
  metrics.sarvamRequestDuration.observe(
    { api: "speech_to_text", model: "saaras:v4", language: "kn-IN" },
    3,
  );
  metrics.sarvamBilledUnits.inc({ api: "speech_to_text", unit: "seconds" }, 12);
  metrics.readingResults.inc({
    language: "kn-IN",
    variant: "native",
    path: "ai",
    outcome: "ok",
  });
  metrics.ordersCreated.inc({
    source: "desk",
    language: "kn-IN",
    variant: "native",
    edited: "false",
  });
  metrics.quoteRequests.inc({ kind: "bulk" });
  metrics.pushSent.inc({ outcome: "ok" });

  const exposition = await metrics.registry.metrics();
  const names = (await metrics.registry.getMetricsAsJSON()).map(
    (metric) => metric.name,
  );
  assert.deepEqual(names.sort(), Object.keys(documented).sort());
  for (const [name, labels] of Object.entries(documented)) {
    const series = name.endsWith("_seconds") ? `${name}_count` : name;
    assert.deepEqual(labelsOf(exposition, series), labels, name);
  }
});

test("GET /metrics answers in the Prometheus text format", async () => {
  const { app } = createTestApp();
  await app.request("/healthz");
  const response = await app.request("/metrics");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type") ?? "", /^text\/plain/);
  assert.match(
    await response.text(),
    /^http_requests_total\{route="\/healthz",method="GET",status="200"\} 1$/m,
  );
});

test("/metrics answers 404 to a request that came through a proxy", async () => {
  const { app } = createTestApp();
  const proxied: Record<string, string>[] = [
    { "X-Forwarded-For": "203.0.113.9" },
    { Forwarded: "for=203.0.113.9" },
  ];
  for (const headers of proxied) {
    const response = await app.request("/metrics", { headers });
    assert.equal(response.status, 404, JSON.stringify(headers));
    assert.doesNotMatch(await response.text(), /http_requests_total/);
  }
});
