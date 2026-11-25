import { Hono } from "hono";
import { Counter, Histogram, Registry } from "prom-client";
import type { AppEnv } from "../http/context.ts";

export type Metrics = ReturnType<typeof createMetrics>;

export const outcomes = [
  "ok",
  "invalid",
  "rate_limited",
  "no_credit",
  "error",
  "timeout",
] as const;
export type Outcome = (typeof outcomes)[number];

export function createMetrics() {
  const registry = new Registry();
  const registers = [registry];
  return {
    registry,
    httpRequests: new Counter({
      name: "http_requests_total",
      help: "HTTP requests by route pattern, method and status.",
      labelNames: ["route", "method", "status"] as const,
      registers,
    }),
    httpRequestDuration: new Histogram({
      name: "http_request_duration_seconds",
      help: "Time to answer an HTTP request, by route pattern.",
      labelNames: ["route"] as const,
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 40, 60],
      registers,
    }),
    sarvamRequests: new Counter({
      name: "sarvam_requests_total",
      help: "Sarvam calls by API, model, language and outcome.",
      labelNames: ["api", "model", "language", "outcome"] as const,
      registers,
    }),
    sarvamRequestDuration: new Histogram({
      name: "sarvam_request_duration_seconds",
      help: "Time of a Sarvam call, by API, model and language.",
      labelNames: ["api", "model", "language"] as const,
      buckets: [0.25, 0.5, 1, 2, 4, 6, 8, 10, 15, 20, 30],
      registers,
    }),
    sarvamBilledUnits: new Counter({
      name: "sarvam_billed_units_total",
      help: "Billed Sarvam units: audio seconds, characters or tokens.",
      labelNames: ["api", "unit"] as const,
      registers,
    }),
    readingResults: new Counter({
      name: "reading_results_total",
      help: "Readings of orders, carts and items, by language, variant, path and outcome.",
      labelNames: ["language", "variant", "path", "outcome"] as const,
      registers,
    }),
    ordersCreated: new Counter({
      name: "orders_created_total",
      help: "Orders created, by source, language, variant and edited.",
      labelNames: ["source", "language", "variant", "edited"] as const,
      registers,
    }),
    quoteRequests: new Counter({
      name: "quote_requests_total",
      help: "Quote requests, by kind.",
      labelNames: ["kind"] as const,
      registers,
    }),
    pushSent: new Counter({
      name: "push_sent_total",
      help: "Web push notifications sent, by outcome.",
      labelNames: ["outcome"] as const,
      registers,
    }),
  };
}

export function metricsRoutes(metrics: Metrics): Hono<AppEnv> {
  return new Hono<AppEnv>().get("/metrics", async (c) => {
    if (c.req.header("X-Forwarded-For") ?? c.req.header("Forwarded")) {
      return c.notFound();
    }
    return c.body(await metrics.registry.metrics(), 200, {
      "Content-Type": metrics.registry.contentType,
    });
  });
}
