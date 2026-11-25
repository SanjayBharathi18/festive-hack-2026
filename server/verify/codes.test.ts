import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../db/database.ts";
import { createTestClock } from "../test-app.ts";
import { codeRules, createCodes } from "./codes.ts";

const phone = "+919876543210";
const secret = "test-session-secret-of-32-characters";

function setup(draws: number[] = []) {
  const db = openDatabase(":memory:");
  const clock = createTestClock();
  let next = 0;
  const codes = createCodes({
    db,
    clock,
    secret,
    draw: () => draws[next++] ?? 123456,
  });
  const start = (target = phone) => {
    const started = codes.start(target, "order");
    assert.ok(started.ok);
    return started.code;
  };
  return { db, clock, codes, start };
}

test("a code has 6 digits, and the database keeps only its keyed hash", () => {
  const { db, codes, start } = setup([42]);
  const code = start();
  assert.equal(code, "000042");
  const rows = db.prepare("SELECT * FROM codes").all() as Record<
    string,
    unknown
  >[];
  assert.equal(rows.length, 1);
  const stored = JSON.stringify(rows);
  assert.doesNotMatch(stored, /000042/);
  assert.match(String(rows[0]?.code_hash), /^[0-9a-f]{64}$/);
  assert.deepEqual(codes.check(phone, "order", code), { ok: true });
});

test("a code expires after 5 minutes", () => {
  const fresh = setup();
  const code = fresh.start();
  fresh.clock.advance(codeRules.ttlMs - 1);
  assert.deepEqual(fresh.codes.check(phone, "order", code), { ok: true });

  const late = setup();
  const lateCode = late.start();
  late.clock.advance(codeRules.ttlMs);
  assert.deepEqual(late.codes.check(phone, "order", lateCode), {
    ok: false,
    reason: "expired",
  });
});

test("a code gets 5 tries", () => {
  const { codes, start } = setup([111111]);
  const code = start();
  for (const triesLeft of [4, 3, 2, 1, 0]) {
    assert.deepEqual(codes.check(phone, "order", "999999"), {
      ok: false,
      reason: "wrong",
      triesLeft,
    });
  }
  assert.deepEqual(codes.check(phone, "order", code), {
    ok: false,
    reason: "tries_used",
  });
});

test("a code works once", () => {
  const { codes, start } = setup();
  const code = start();
  assert.deepEqual(codes.check(phone, "order", code), { ok: true });
  assert.deepEqual(codes.check(phone, "order", code), {
    ok: false,
    reason: "used",
  });
});

test("a new code replaces the code before it", () => {
  const { codes, start } = setup([111111, 222222]);
  const first = start();
  const second = start();
  assert.equal(codes.check(phone, "order", first).ok, false);
  assert.deepEqual(codes.check(phone, "order", second), { ok: true });
});

test("a code works only for its number and its purpose", () => {
  const { codes, start } = setup();
  const code = start();
  assert.equal(codes.check("+919876500000", "order", code).ok, false);
  assert.equal(codes.check(phone, "desk", code).ok, false);
  assert.deepEqual(codes.check(phone, "order", code), { ok: true });
});

test("a number gets 3 codes in 15 minutes", () => {
  const { clock, codes, start } = setup();
  start();
  clock.advance(60_000);
  start();
  assert.ok(codes.start(phone, "desk").ok);
  assert.deepEqual(codes.start(phone, "order"), {
    ok: false,
    retryAfterMs: codeRules.windowMs - 60_000,
  });
  assert.ok(codes.start("+919876500000", "order").ok);
  clock.advance(codeRules.windowMs - 60_000);
  assert.ok(codes.start(phone, "order").ok);
});

test("codes older than the rate window are removed", () => {
  const { db, clock, start } = setup();
  start();
  clock.advance(codeRules.windowMs);
  start("+919876500000");
  assert.equal(db.prepare("SELECT count(*) FROM codes").pluck().get(), 1);
});
