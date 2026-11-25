import assert from "node:assert/strict";
import { test } from "node:test";
import { errorBodySchema } from "../../shared/errors.ts";
import { createTestApp } from "../test-app.ts";

test("/healthz answers while the process runs", async () => {
  const { app } = createTestApp();
  const response = await app.request("/healthz");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("/readyz is ready when the database answers and is migrated", async () => {
  const { app } = createTestApp();
  const response = await app.request("/readyz");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ready" });
});

test("/readyz answers 503 when the database is not ready", async () => {
  const { app, deps } = createTestApp();
  deps.db.close();
  const response = await app.request("/readyz");
  assert.equal(response.status, 503);
  const { error } = errorBodySchema.parse(await response.json());
  assert.equal(error.code, "not_ready");
});

test("/readyz answers 503 while the server shuts down", async () => {
  const { app } = createTestApp({ isShuttingDown: () => true });
  const response = await app.request("/readyz");
  assert.equal(response.status, 503);
  const { error } = errorBodySchema.parse(await response.json());
  assert.equal(error.code, "shutting_down");
});
