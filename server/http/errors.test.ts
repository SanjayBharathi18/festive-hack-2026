import assert from "node:assert/strict";
import { test } from "node:test";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { timeout } from "hono/timeout";
import { errorBodySchema } from "../../shared/errors.ts";
import { createTestApp } from "../test-app.ts";
import { appError, isAppError } from "./errors.ts";

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

test("an app error answers with its status, code and message", async () => {
  const { app } = createTestApp();
  app.get("/api/test/days", () => {
    throw appError(400, "invalid_input", "Pick a day after today.");
  });
  const response = await app.request("/api/test/days", {
    headers: { "X-Request-Id": "req-1" },
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await errorOf(response), {
    code: "invalid_input",
    message: "Pick a day after today.",
    request_id: "req-1",
  });
});

test("an HTTP exception with a known status keeps the error shape", async () => {
  const { app } = createTestApp();
  app.post("/api/test/upload", () => {
    throw new HTTPException(413, { message: "The file is over 1 MB." });
  });
  const response = await app.request("/api/test/upload", { method: "POST" });
  assert.equal(response.status, 413);
  assert.equal((await errorOf(response)).code, "payload_too_large");
});

test("an unexpected error answers 500 and hides its message", async () => {
  const { app, logs } = createTestApp();
  app.get("/api/test/bug", () => {
    throw new TypeError("secret detail");
  });
  const response = await app.request("/api/test/bug");
  assert.equal(response.status, 500);
  const error = await errorOf(response);
  assert.equal(error.code, "internal_error");
  assert.doesNotMatch(error.message, /secret detail/);
  assert.equal(logs()[0]?.error, "TypeError: secret detail");
});

test("an unknown address answers 404 in the error shape", async () => {
  const { app, logs } = createTestApp();
  const response = await app.request("/no/such/page");
  assert.equal(response.status, 404);
  assert.equal((await errorOf(response)).code, "not_found");
  assert.doesNotMatch(String(logs()[0]?.route), /no\/such/);
});

test("only errors made by appError count as app errors", () => {
  assert.ok(isAppError(appError(400, "invalid_input", "Check the day.")));
  const lookalike = Object.assign(new Error("x"), {
    status: 400,
    code: "invalid_input",
  });
  assert.equal(isAppError(lookalike), false);
});

test("an HTTP exception under 500 keeps its status, with a code and a message", async () => {
  const { app } = createTestApp();
  app.post("/api/test/csrf", csrf(), (c) => c.json({ ok: true }));
  app.post("/api/test/limited", bodyLimit({ maxSize: 8 }), async (c) =>
    c.json({ size: (await c.req.text()).length }),
  );
  app.get("/api/test/teapot", () => {
    throw new HTTPException(418, { message: "No tea here." });
  });
  const crossSite = await app.request("/api/test/csrf", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "a=1",
  });
  assert.equal(crossSite.status, 403);
  const forbidden = await errorOf(crossSite);
  assert.equal(forbidden.code, "forbidden");
  assert.notEqual(forbidden.message, "");

  const large = await app.request("/api/test/limited", {
    method: "POST",
    body: "more than eight bytes",
  });
  assert.equal(large.status, 413);
  const tooLarge = await errorOf(large);
  assert.equal(tooLarge.code, "payload_too_large");
  assert.notEqual(tooLarge.message, "");

  const teapot = await app.request("/api/test/teapot");
  assert.equal(teapot.status, 418);
  assert.deepEqual(await errorOf(teapot), {
    code: "invalid_input",
    message: "No tea here.",
    request_id: teapot.headers.get("X-Request-Id"),
  });
});

test("a 5xx HTTP exception keeps its status, is logged, and hides its message", async (t) => {
  const keepAlive = setInterval(() => {}, 10);
  t.after(() => clearInterval(keepAlive));
  const { app, logs } = createTestApp();
  app.get("/api/test/slow", timeout(10), async (c) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return c.json({ ok: true });
  });
  const response = await app.request("/api/test/slow");
  assert.equal(response.status, 504);
  const error = await errorOf(response);
  assert.equal(error.code, "timeout");
  assert.equal(logs()[0]?.error, "Error: Gateway Timeout");
});

test("a thrown value that is not an Error still answers in the error shape and is logged", async () => {
  const { app, logs } = createTestApp();
  app.get("/api/test/throws/:kind", (c) => {
    throw c.req.param("kind") === "string" ? "day is full" : { reason: "x" };
  });
  for (const [kind, described] of [
    ["string", '"day is full"'],
    ["object", "an object (Object)"],
  ]) {
    const response = await app.request(`/api/test/throws/${kind}`);
    assert.equal(response.status, 500);
    assert.equal((await errorOf(response)).code, "internal_error");
    const [error, request] = logs().slice(-2);
    assert.equal(
      error?.error,
      `Error: A value that is not an Error was thrown: ${described}`,
    );
    assert.equal(request?.route, "/api/test/throws/:kind");
    assert.equal(request?.status, 500);
  }
});
