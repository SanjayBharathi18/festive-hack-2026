import assert from "node:assert/strict";
import { test } from "node:test";
import { createVapidKeys } from "../scripts/vapid.ts";
import { parseConfig, type Env, type Problem } from "./config.ts";

const secret = "a-session-secret-of-32-characters";

function problems(env: Env): Problem[] {
  const result = parseConfig(env);
  assert.equal(result.ok, false);
  return result.ok ? [] : result.problems;
}

function variables(env: Env): string[] {
  return problems(env).map((problem) => problem.variable);
}

test("only SESSION_SECRET is needed; the rest has defaults", () => {
  const result = parseConfig({ SESSION_SECRET: secret });
  assert.ok(result.ok);
  assert.deepEqual(result.config, {
    SARVAM_MODE: "recorded",
    SARVAM_BASE_URL: "https://api.sarvam.ai",
    SESSION_SECRET: secret,
    PUBLIC_URL: "http://localhost:8080",
    DATA_DIR: "./data",
    PORT: 8080,
    HOST: "0.0.0.0",
  });
});

test("a full configuration is valid", () => {
  const vapid = createVapidKeys();
  const result = parseConfig({
    SARVAM_MODE: "live",
    SARVAM_API_KEY: "sk_live_key",
    SARVAM_BASE_URL: "https://sarvam.example.com",
    FLAGSMITH_ENVIRONMENT_KEY: "ser.environment",
    FLAGSMITH_API_URL: "https://flagsmith.example.com/api/v1/",
    FLAGSMITH_ORG_API_KEY: "organisation-key",
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: "mailto:team@example.com",
    SESSION_SECRET: secret,
    DEMO_DESK_TOKEN: "demo_token-1234567890",
    PUBLIC_URL: "https://34-12-56-78.sslip.io/",
    DATA_DIR: "/data",
    PORT: "3000",
    HOST: "127.0.0.1",
  });
  assert.ok(result.ok);
  assert.equal(result.config.PORT, 3000);
  assert.equal(result.config.PUBLIC_URL, "https://34-12-56-78.sslip.io");
});

test("the default PUBLIC_URL uses the port", () => {
  const result = parseConfig({ SESSION_SECRET: secret, PORT: "9000" });
  assert.ok(result.ok);
  assert.equal(result.config.PUBLIC_URL, "http://localhost:9000");
});

test("empty values count as not set", () => {
  const result = parseConfig({
    SESSION_SECRET: secret,
    SARVAM_MODE: "",
    SARVAM_API_KEY: " ",
    PORT: "",
  });
  assert.ok(result.ok);
  assert.equal(result.config.SARVAM_MODE, "recorded");
  assert.equal(result.config.SARVAM_API_KEY, undefined);
  assert.equal(result.config.PORT, 8080);
});

test("other environment variables are ignored", () => {
  const result = parseConfig({ SESSION_SECRET: secret, HOME: "/home/x" });
  assert.ok(result.ok);
  assert.equal("HOME" in result.config, false);
});

test("the server does not start without SESSION_SECRET", () => {
  const [problem] = problems({});
  assert.equal(problem?.variable, "SESSION_SECRET");
  assert.match(problem?.message ?? "", /^missing\./);
});

test("a short SESSION_SECRET is named, and its value is not shown", () => {
  const short = "short-secret-value";
  const found = problems({ SESSION_SECRET: short });
  assert.deepEqual(
    found.map((problem) => problem.variable),
    ["SESSION_SECRET"],
  );
  assert.doesNotMatch(JSON.stringify(found), new RegExp(short));
});

test("each wrong variable is named, with no values", () => {
  const env = {
    SESSION_SECRET: secret,
    SARVAM_MODE: "sometimes",
    SARVAM_BASE_URL: "ftp://sarvam.example.com",
    PUBLIC_URL: "not a url",
    PORT: "80a",
    DEMO_DESK_TOKEN: "short",
    VAPID_SUBJECT: "team@example.com",
    VAPID_PUBLIC_KEY: "bm90LWEta2V5",
    VAPID_PRIVATE_KEY: "bm90LWEta2V5",
  };
  const found = problems(env);
  assert.deepEqual(found.map((problem) => problem.variable).sort(), [
    "DEMO_DESK_TOKEN",
    "PORT",
    "PUBLIC_URL",
    "SARVAM_BASE_URL",
    "SARVAM_MODE",
    "VAPID_PRIVATE_KEY",
    "VAPID_PUBLIC_KEY",
    "VAPID_SUBJECT",
  ]);
  const text = JSON.stringify(found);
  for (const value of Object.values(env).filter((value) => value !== secret)) {
    assert.equal(text.includes(value), false, `shows ${value}`);
  }
});

test("live mode needs the Sarvam key", () => {
  assert.deepEqual(variables({ SESSION_SECRET: secret, SARVAM_MODE: "live" }), [
    "SARVAM_API_KEY",
  ]);
});

test("the VAPID variables come as a set of three", () => {
  const { publicKey } = createVapidKeys();
  assert.deepEqual(
    variables({ SESSION_SECRET: secret, VAPID_PUBLIC_KEY: publicKey }),
    ["VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
  );
});

test("the VAPID keys must be one pair", () => {
  const first = createVapidKeys();
  const second = createVapidKeys();
  const found = problems({
    SESSION_SECRET: secret,
    VAPID_PUBLIC_KEY: first.publicKey,
    VAPID_PRIVATE_KEY: second.privateKey,
    VAPID_SUBJECT: "mailto:team@example.com",
  });
  assert.deepEqual(
    found.map((problem) => problem.variable),
    ["VAPID_PRIVATE_KEY"],
  );
  assert.doesNotMatch(JSON.stringify(found), new RegExp(second.privateKey));
});

test("all problems show at once", () => {
  assert.deepEqual(variables({ SARVAM_MODE: "live", PORT: "0" }).sort(), [
    "PORT",
    "SARVAM_API_KEY",
    "SESSION_SECRET",
  ]);
});

test("PRIVACY_CONTACT is optional; when set, it is the trimmed contact", () => {
  const set = parseConfig({
    SESSION_SECRET: secret,
    PRIVACY_CONTACT: "  privacy@example.org ",
  });
  assert.ok(set.ok);
  assert.equal(set.config.PRIVACY_CONTACT, "privacy@example.org");
  const empty = parseConfig({ SESSION_SECRET: secret, PRIVACY_CONTACT: " " });
  assert.ok(empty.ok);
  assert.equal(empty.config.PRIVACY_CONTACT, undefined);
  assert.deepEqual(
    variables({ SESSION_SECRET: secret, PRIVACY_CONTACT: "x" }),
    ["PRIVACY_CONTACT"],
  );
});
