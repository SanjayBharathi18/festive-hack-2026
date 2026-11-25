import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { errorBodySchema } from "../../shared/errors.ts";
import { createTestClock } from "../test-app.ts";
import type { AppEnv } from "./context.ts";
import { clientIp, rateLimit, rateRules } from "./rate-limit.ts";

function limitedApp(limit: number, windowMs: number) {
  const clock = createTestClock();
  const app = new Hono<AppEnv>();
  app.use(requestId());
  app.get("/api/test/search", rateLimit({ limit, windowMs }, clock), (c) =>
    c.json({ ok: true }),
  );
  const from = (forwardedFor: string) =>
    app.request("/api/test/search", {
      headers: { "X-Forwarded-For": forwardedFor },
    });
  return { clock, from };
}

test("the rules are the limits of docs/system.md", () => {
  assert.deepEqual(rateRules, {
    codes: { limit: 60, windowMs: 3_600_000 },
    readings: { limit: 20, windowMs: 60_000 },
    searches: { limit: 60, windowMs: 60_000 },
    uploads: { limit: 20, windowMs: 60_000 },
  });
});

test("over the limit, an IP gets 429 with Retry-After", async () => {
  const { clock, from } = limitedApp(2, 60_000);
  assert.equal((await from("203.0.113.1")).status, 200);
  clock.advance(15_000);
  assert.equal((await from("203.0.113.1")).status, 200);
  const limited = await from("203.0.113.1");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "45");
  const { error } = errorBodySchema.parse(await limited.json());
  assert.equal(error.code, "rate_limited");
  assert.match(error.message, /45 seconds/);
});

test("each IP has its own count", async () => {
  const { from } = limitedApp(1, 60_000);
  assert.equal((await from("203.0.113.1")).status, 200);
  assert.equal((await from("203.0.113.2")).status, 200);
  assert.equal((await from("203.0.113.1")).status, 429);
});

test("the count starts again after the window", async () => {
  const { clock, from } = limitedApp(1, 60_000);
  assert.equal((await from("203.0.113.1")).status, 200);
  assert.equal((await from("203.0.113.1")).status, 429);
  clock.advance(60_000);
  assert.equal((await from("203.0.113.1")).status, 200);
});

test("the client IP is the address that the proxy added last", async () => {
  const { from } = limitedApp(1, 60_000);
  assert.equal((await from("198.51.100.7, 203.0.113.1")).status, 200);
  assert.equal((await from("10.0.0.1, 203.0.113.1")).status, 429);
  assert.equal((await from("198.51.100.7")).status, 200);
});

test("with no X-Forwarded-For, the socket address is the client IP", async () => {
  const app = new Hono<AppEnv>().get("/", (c) => c.text(clientIp(c)));
  const bare = await app.request("/");
  assert.equal(await bare.text(), "unknown");
  const viaSocket = await app.request(
    "/",
    {},
    {
      incoming: { socket: { remoteAddress: "192.0.2.5" } } as never,
    },
  );
  assert.equal(await viaSocket.text(), "192.0.2.5");
});
