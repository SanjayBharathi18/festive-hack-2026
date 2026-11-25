import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import type { MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { errorBodySchema } from "../../shared/errors.ts";
import { openDatabase } from "../db/database.ts";
import { migrate, readMigrations } from "../db/migrate.ts";
import { createTestApp, createTestClock } from "../test-app.ts";
import type { AppEnv } from "./context.ts";
import {
  createIdempotency,
  idempotencyTtlMs,
  idempotentBodyLimitBytes,
} from "./idempotency.ts";
import { readJson } from "./input.ts";

function appWithCreateRoute(status: ContentfulStatusCode = 201) {
  const clock = createTestClock();
  const { app, deps } = createTestApp({ clock });
  const idempotent = createIdempotency({ db: deps.db, clock });
  let created = 0;
  let gate: Promise<void> = Promise.resolve();
  app.post("/api/test/orders", idempotent, async (c) => {
    await gate;
    created += 1;
    return c.json({ order: created }, status);
  });
  const post = (key?: string, path = "/api/test/orders") =>
    app.request(path, {
      method: "POST",
      headers: key === undefined ? {} : { "Idempotency-Key": key },
    });
  return {
    clock,
    post,
    created: () => created,
    hold: () => {
      let open = () => {};
      gate = new Promise((resolve) => {
        open = resolve;
      });
      return () => open();
    },
    db: deps.db,
  };
}

const key = "7f9c2ba4-e88f-4f2b-9d2a-1c4b5d6e7f80";

test("a repeat with the same key replays the stored status and body", async () => {
  const { post, created } = appWithCreateRoute();
  const first = await post(key);
  const repeat = await post(key);
  assert.equal(first.status, 201);
  assert.equal(repeat.status, 201);
  assert.deepEqual(await repeat.json(), { order: 1 });
  assert.equal(repeat.headers.get("Idempotent-Replayed"), "true");
  assert.match(repeat.headers.get("Content-Type") ?? "", /application\/json/);
  assert.equal(created(), 1);
});

test("a new key makes a new record", async () => {
  const { post, created } = appWithCreateRoute();
  await post(key);
  await post("0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d");
  assert.equal(created(), 2);
});

test("a repeat while the first request runs gets 409", async () => {
  const { post, created, hold } = appWithCreateRoute();
  const open = hold();
  const first = post(key);
  const repeat = await post(key);
  assert.equal(repeat.status, 409);
  const { error } = errorBodySchema.parse(await repeat.json());
  assert.equal(error.code, "idempotency_key_in_use");
  open();
  assert.equal((await first).status, 201);
  assert.equal((await post(key)).status, 201);
  assert.equal(created(), 1);
});

test("a key expires after 24 hours", async () => {
  const { post, created, clock } = appWithCreateRoute();
  await post(key);
  clock.advance(idempotencyTtlMs - 1);
  await post(key);
  assert.equal(created(), 1);
  clock.advance(1);
  const later = await post(key);
  assert.deepEqual(await later.json(), { order: 2 });
  assert.equal(created(), 2);
});

test("a failed request frees its key, so a retry runs again", async () => {
  const { post, created } = appWithCreateRoute(422);
  assert.equal((await post(key)).status, 422);
  assert.equal((await post(key)).status, 422);
  assert.equal(created(), 2);
});

test("the same key on another route is another request", async () => {
  const clock = createTestClock();
  const { app, deps } = createTestApp({ clock });
  const idempotent = createIdempotency({ db: deps.db, clock });
  app.post("/api/test/:kind", idempotent, (c) =>
    c.json({ kind: c.req.param("kind") }, 201),
  );
  const post = (path: string) =>
    app.request(path, { method: "POST", headers: { "Idempotency-Key": key } });
  assert.deepEqual(await (await post("/api/test/orders")).json(), {
    kind: "orders",
  });
  assert.deepEqual(await (await post("/api/test/quotes")).json(), {
    kind: "quotes",
  });
});

test("a create request needs a key", async () => {
  const { post, created } = appWithCreateRoute();
  for (const missing of [undefined, "short", "has spaces in it"]) {
    const response = await post(missing);
    assert.equal(response.status, 400);
    const { error } = errorBodySchema.parse(await response.json());
    assert.equal(error.code, "idempotency_key_missing");
  }
  assert.equal(created(), 0);
});

test("after a restart, keys of unfinished requests are free again", () => {
  const db = openDatabase(":memory:");
  db.prepare(
    "INSERT INTO idempotency_keys (key, route, request_hash, created_at) VALUES (?, ?, ?, ?)",
  ).run(key, "POST /api/orders", "0".repeat(64), 1);
  createIdempotency({ db, clock: createTestClock() });
  assert.equal(
    db.prepare("SELECT count(*) FROM idempotency_keys").pluck().get(),
    0,
  );
});

test("a replay keeps the cookies and the Location of the first answer", async () => {
  const clock = createTestClock();
  const { app, deps } = createTestApp({ clock });
  const idempotent = createIdempotency({ db: deps.db, clock });
  app.post("/api/test/sessions", idempotent, (c) => {
    c.header("Set-Cookie", "session=abc; HttpOnly; Path=/", { append: true });
    c.header("Set-Cookie", "language=kn; Path=/", { append: true });
    c.header("Location", "/o/abcdefghijklmnop");
    return c.json({ ok: true }, 201);
  });
  const post = () =>
    app.request("/api/test/sessions", {
      method: "POST",
      headers: { "Idempotency-Key": key },
    });
  const first = await post();
  const repeat = await post();
  assert.equal(repeat.headers.get("Idempotent-Replayed"), "true");
  assert.deepEqual(repeat.headers.getSetCookie(), [
    "session=abc; HttpOnly; Path=/",
    "language=kn; Path=/",
  ]);
  assert.deepEqual(repeat.headers.getSetCookie(), first.headers.getSetCookie());
  assert.equal(repeat.headers.get("Location"), "/o/abcdefghijklmnop");
});

test("a thrown value that is not an Error frees the key", async () => {
  const clock = createTestClock();
  const { app, deps } = createTestApp({ clock });
  const idempotent = createIdempotency({ db: deps.db, clock });
  let calls = 0;
  app.post("/api/test/flaky", idempotent, (c) => {
    calls += 1;
    if (calls === 1) throw "not an Error";
    return c.json({ calls }, 201);
  });
  const post = () =>
    app.request("/api/test/flaky", {
      method: "POST",
      headers: { "Idempotency-Key": key },
    });
  assert.equal((await post()).status, 500);
  const retry = await post();
  assert.equal(retry.status, 201);
  assert.deepEqual(await retry.json(), { calls: 2 });
});

test("a row stored before cookies were kept still replays", async () => {
  const clock = createTestClock();
  const { app, deps } = createTestApp({ clock });
  const idempotent = createIdempotency({ db: deps.db, clock });
  app.post("/api/test/old", idempotent, (c) => c.json({ fresh: true }, 201));
  const post = () =>
    app.request("/api/test/old", {
      method: "POST",
      headers: { "Idempotency-Key": key },
    });
  await post();
  deps.db.prepare("UPDATE idempotency_keys SET response = ? WHERE key = ?").run(
    JSON.stringify({
      status: 201,
      type: "application/json",
      body: '{"old":true}',
    }),
    key,
  );
  const replay = await post();
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), { old: true });
  assert.deepEqual(replay.headers.getSetCookie(), []);
});

function appWithSlips(db?: Database.Database) {
  const clock = createTestClock();
  const { app, deps } = createTestApp(db ? { clock, db } : { clock });
  const idempotent = createIdempotency({ db: deps.db, clock });
  const scope: MiddlewareHandler<AppEnv> = async (c, next) => {
    const store = c.req.header("X-Test-Store");
    if (store !== undefined) c.set("idempotencyScope", store);
    await next();
  };
  let created = 0;
  app.post("/api/test/slips", scope, idempotent, async (c) => {
    const { buyer } = await readJson(c, z.object({ buyer: z.string() }));
    created += 1;
    return c.json({ slip: created, buyer }, 201);
  });
  const post = (
    buyer: string,
    { store, query = "" }: { store?: string; query?: string } = {},
  ) =>
    app.request(`/api/test/slips${query}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        ...(store === undefined ? {} : { "X-Test-Store": store }),
      },
      body: JSON.stringify({ buyer }),
    });
  return { post, created: () => created };
}

async function codeOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error.code;
}

test("the same key with the same body replays, and the handler can still read the body", async () => {
  const { post, created } = appWithSlips();
  const first = await post("Priya");
  assert.deepEqual(await first.json(), { slip: 1, buyer: "Priya" });
  const repeat = await post("Priya");
  assert.equal(repeat.headers.get("Idempotent-Replayed"), "true");
  assert.deepEqual(await repeat.json(), { slip: 1, buyer: "Priya" });
  assert.equal(created(), 1);
});

test("the same key with another body answers 422 and does not run the handler", async () => {
  const { post, created } = appWithSlips();
  assert.equal((await post("Priya")).status, 201);
  const reused = await post("Asha");
  assert.equal(reused.status, 422);
  assert.equal(await codeOf(reused), "idempotency_key_reused");
  assert.equal(reused.headers.get("Idempotent-Replayed"), null);
  assert.equal(created(), 1);
  assert.deepEqual(await (await post("Priya")).json(), {
    slip: 1,
    buyer: "Priya",
  });
});

test("the same key with another query string answers 422", async () => {
  const { post, created } = appWithSlips();
  assert.equal((await post("Priya")).status, 201);
  const reused = await post("Priya", { query: "?via=market" });
  assert.equal(reused.status, 422);
  assert.equal(created(), 1);
});

test("two callers with the same key get two independent records", async () => {
  const { post, created } = appWithSlips();
  const hero = await post("Priya", { store: "shobhas-kitchen" });
  const other = await post("Asha", { store: "ghar-ki-mithai" });
  assert.equal(other.status, 201);
  assert.equal(other.headers.get("Idempotent-Replayed"), null);
  assert.deepEqual(await other.json(), { slip: 2, buyer: "Asha" });
  assert.deepEqual(await hero.json(), { slip: 1, buyer: "Priya" });
  const heroAgain = await post("Priya", { store: "shobhas-kitchen" });
  assert.deepEqual(await heroAgain.json(), { slip: 1, buyer: "Priya" });
  const otherAgain = await post("Asha", { store: "ghar-ki-mithai" });
  assert.deepEqual(await otherAgain.json(), { slip: 2, buyer: "Asha" });
  assert.equal(created(), 2);
});

test("keys stored before the request hash are dropped by the migration, so they count as expired", async () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const migrations = readMigrations(
    new URL("../db/migrations/", import.meta.url),
  );
  migrate(db, migrations.slice(0, 1));
  db.prepare(
    "INSERT INTO idempotency_keys (key, route, response, created_at) VALUES (?, ?, ?, ?)",
  ).run(
    key,
    "POST /api/test/slips",
    JSON.stringify({
      status: 201,
      type: "application/json",
      body: '{"slip":1,"buyer":"Someone else"}',
    }),
    Date.now(),
  );
  migrate(db, migrations);
  assert.equal(
    db.prepare("SELECT count(*) FROM idempotency_keys").pluck().get(),
    0,
  );
  const { post, created } = appWithSlips(db);
  const response = await post("Priya");
  assert.deepEqual(await response.json(), { slip: 1, buyer: "Priya" });
  assert.equal(created(), 1);
});

test("a body over the limit answers 413 before any key is stored", async () => {
  const { app, deps } = createTestApp();
  const idempotent = createIdempotency({ db: deps.db, clock: deps.clock });
  app.post("/api/test/upload", idempotent, (c) => c.json({ ok: true }, 201));
  const response = await app.request("/api/test/upload", {
    method: "POST",
    headers: { "Idempotency-Key": key, "Content-Type": "audio/wav" },
    body: new Uint8Array(idempotentBodyLimitBytes + 1),
  });
  assert.equal(response.status, 413);
  assert.equal(await codeOf(response), "payload_too_large");
  assert.equal(
    deps.db.prepare("SELECT count(*) FROM idempotency_keys").pluck().get(),
    0,
  );
});
