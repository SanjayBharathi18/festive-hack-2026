import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { test } from "node:test";
import {
  isVapidPrivateKey,
  isVapidPublicKey,
  parseConfig,
  vapidPairMatches,
} from "../server/config.ts";
import { createVapidKeys, envLines } from "./vapid.ts";

test("the public key is an uncompressed P-256 point of 65 bytes", () => {
  const { publicKey } = createVapidKeys();
  const bytes = Buffer.from(publicKey, "base64url");
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 0x04);
  assert.match(publicKey, /^[\w-]{87}$/);
  assert.ok(isVapidPublicKey(publicKey));
});

test("65 bytes that are not a point on the curve are not a public key", () => {
  const offCurve = Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 1)]);
  assert.equal(isVapidPublicKey(offCurve.toString("base64url")), false);
});

test("the private key is 32 bytes in base64url", () => {
  const { privateKey } = createVapidKeys();
  assert.match(privateKey, /^[\w-]{43}$/);
  assert.ok(isVapidPrivateKey(privateKey));
});

test("the two keys are one pair: a signature verifies", () => {
  const keys = createVapidKeys();
  const point = Buffer.from(keys.publicKey, "base64url");
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: point.subarray(1, 33).toString("base64url"),
    y: point.subarray(33).toString("base64url"),
  };
  const privateKey = createPrivateKey({
    key: { ...jwk, d: keys.privateKey },
    format: "jwk",
  });
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signature = sign("sha256", Buffer.from("push"), privateKey);
  assert.ok(verify("sha256", Buffer.from("push"), publicKey, signature));
  assert.ok(vapidPairMatches(keys.publicKey, keys.privateKey));
});

test("each run makes a new pair", () => {
  assert.notEqual(createVapidKeys().publicKey, createVapidKeys().publicKey);
});

test("the three lines pass the configuration check", () => {
  const lines = envLines(createVapidKeys(), "mailto:team@example.com");
  const env = Object.fromEntries(
    lines.split("\n").map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );
  assert.deepEqual(Object.keys(env), [
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
  ]);
  const result = parseConfig({ ...env, SESSION_SECRET: "s".repeat(32) });
  assert.equal(result.ok, true);
});
