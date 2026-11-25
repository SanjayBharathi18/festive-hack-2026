import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "../test-app.ts";

test("each request writes one JSON line with the agreed fields", async () => {
  const { app, logs } = createTestApp();
  const response = await app.request("/healthz");
  assert.equal(response.status, 200);
  const [line, ...rest] = logs();
  assert.equal(rest.length, 0);
  assert.deepEqual(Object.keys(line ?? {}), [
    "time",
    "request_id",
    "method",
    "route",
    "status",
    "duration_ms",
    "flags",
  ]);
  assert.equal(line?.time, "2026-11-24T06:30:00.000Z");
  assert.equal(line?.method, "GET");
  assert.equal(line?.route, "/healthz");
  assert.equal(line?.status, 200);
  assert.equal(typeof line?.duration_ms, "number");
  assert.deepEqual(line?.flags, {});
});

test("the request ID comes from X-Request-Id, or is made", async () => {
  const { app, logs } = createTestApp();
  const given = await app.request("/healthz", {
    headers: { "X-Request-Id": "req-123" },
  });
  const made = await app.request("/healthz");
  assert.equal(given.headers.get("X-Request-Id"), "req-123");
  const madeId = made.headers.get("X-Request-Id");
  assert.match(madeId ?? "", /^[\da-f-]{36}$/);
  assert.deepEqual(
    logs().map((line) => line.request_id),
    ["req-123", madeId],
  );
});

test("the line has the route pattern, never the raw path", async () => {
  const { app, lines, logs } = createTestApp({
    readPage: async () => "<!doctype html><title>Store</title>",
  });
  await app.request("/s/shobhas-kitchen");
  await app.request("/o/secret-order-token-123");
  assert.deepEqual(
    logs().map((line) => line.route),
    ["/s/:slug", "/o/:token"],
  );
  assert.doesNotMatch(lines.join("\n"), /shobhas-kitchen|secret-order-token/);
});

test("the line holds no body, query or header values", async () => {
  const { app, lines, logs } = createTestApp();
  app.post("/api/test/orders", (c) => c.json({ ok: true }, 201));
  await app.request("/api/test/orders?phone=%2B919812345678", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": "203.0.113.9",
    },
    body: JSON.stringify({
      buyer_phone: "+919876543210",
      address: "12 Temple Street, Basavanagudi",
    }),
  });
  assert.equal(logs()[0]?.status, 201);
  assert.doesNotMatch(
    lines.join("\n"),
    /9876543210|9812345678|Temple|203\.0\.113\.9/,
  );
});

test("the flag variants that a request used are in its line", async () => {
  const { app, logs } = createTestApp();
  app.get("/api/test/read", (c) => {
    c.set("flagVariants", {
      ...c.get("flagVariants"),
      ops_reading: "ai",
      exp_reading_path: "native",
    });
    return c.json({ ok: true });
  });
  await app.request("/api/test/read");
  assert.deepEqual(logs()[0]?.flags, {
    ops_reading: "ai",
    exp_reading_path: "native",
  });
});

test("a failing request is logged with its status and route", async () => {
  const { app, logs } = createTestApp();
  app.get("/api/test/fail/:id", () => {
    throw new Error("boom");
  });
  const response = await app.request("/api/test/fail/42");
  assert.equal(response.status, 500);
  const [error, request] = logs();
  assert.equal(error?.error, "Error: boom");
  assert.equal(error?.request_id, request?.request_id);
  assert.equal(request?.route, "/api/test/fail/:id");
  assert.equal(request?.status, 500);
});
