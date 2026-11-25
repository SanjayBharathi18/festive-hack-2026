import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "../test-app.ts";

test("HTTP metrics use the route pattern, never the raw path", async () => {
  const { app, deps } = createTestApp({
    readPage: async (page) =>
      page === "store" ? "<title>Store</title>" : undefined,
  });
  await app.request("/s/shobhas-kitchen");
  await app.request("/s/ghar-ki-mithai");
  await app.request("/o/secret-order-token-123");
  const exposition = await deps.metrics.registry.metrics();
  assert.match(
    exposition,
    /^http_requests_total\{route="\/s\/:slug",method="GET",status="200"\} 2$/m,
  );
  assert.match(
    exposition,
    /^http_requests_total\{route="\/o\/:token",method="GET",status="404"\} 1$/m,
  );
  assert.match(
    exposition,
    /^http_request_duration_seconds_count\{route="\/s\/:slug"\} 2$/m,
  );
  assert.doesNotMatch(
    exposition,
    /shobhas-kitchen|ghar-ki-mithai|secret-order/,
  );
});
