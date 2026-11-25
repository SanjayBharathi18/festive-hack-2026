import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../db/database.ts";
import { createTestClock } from "../test-app.ts";
import { createSessions, sessionRules } from "./sessions.ts";

const secret = "test-session-secret-of-32-characters";

function setup() {
  const db = openDatabase(":memory:");
  const clock = createTestClock();
  return { db, clock, sessions: createSessions({ db, clock, secret }) };
}

test("the database keeps a keyed hash of the token, never the token", () => {
  const { db, sessions } = setup();
  const { token } = sessions.open("desk", "seller-1");
  assert.match(token, /^[\w-]{43}$/);
  const rows = db.prepare("SELECT * FROM sessions").all() as {
    id: string;
    kind: string;
    subject: string;
  }[];
  assert.equal(rows.length, 1);
  assert.doesNotMatch(JSON.stringify(rows), new RegExp(token));
  assert.match(rows[0]?.id ?? "", /^[0-9a-f]{64}$/);
  assert.equal(rows[0]?.kind, "seller");
  assert.equal(rows[0]?.subject, "seller-1");
});

test("a seller session lasts 90 days", () => {
  const { clock, sessions } = setup();
  const { token, expiresAt } = sessions.open("desk", "seller-1");
  assert.equal(sessionRules.desk.ttlMs, 90 * 24 * 60 * 60 * 1000);
  assert.equal(expiresAt, clock.now() + sessionRules.desk.ttlMs);
  clock.advance(sessionRules.desk.ttlMs - 1);
  assert.equal(sessions.find("desk", token)?.subject, "seller-1");
  clock.advance(1);
  assert.equal(sessions.find("desk", token), undefined);
});

test("an order proof lasts 15 minutes and works once", () => {
  const { clock, sessions } = setup();
  const { token } = sessions.open("order", "+919876543210");
  clock.advance(sessionRules.order.ttlMs - 1);
  assert.equal(sessions.find("order", token)?.subject, "+919876543210");
  assert.equal(sessions.close("order", token), true);
  assert.equal(sessions.close("order", token), false);
  assert.equal(sessions.find("order", token), undefined);
  const late = sessions.open("order", "+919876543210");
  clock.advance(sessionRules.order.ttlMs);
  assert.equal(sessions.close("order", late.token), false);
});

test("a token opens only the purpose that it was made for", () => {
  const { sessions } = setup();
  const proof = sessions.open("order", "+919876543210");
  const desk = sessions.open("desk", "seller-1");
  assert.equal(sessions.find("desk", proof.token), undefined);
  assert.equal(sessions.find("order", desk.token), undefined);
  assert.equal(sessions.find("desk", "made-up-token"), undefined);
});

test("expired sessions are removed when a new one opens", () => {
  const { db, clock, sessions } = setup();
  sessions.open("order", "+919876543210");
  clock.advance(sessionRules.order.ttlMs);
  sessions.open("desk", "seller-1");
  assert.equal(db.prepare("SELECT count(*) FROM sessions").pluck().get(), 1);
});
