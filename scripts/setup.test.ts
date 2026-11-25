import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fillEmpty, readValue, runSetup } from "./setup.ts";

const example = [
  "# Settings",
  "SESSION_SECRET=",
  "PUBLIC_URL=",
  "PORT=8080",
  "HOST=0.0.0.0",
  "DEMO_DESK_TOKEN=",
  "",
].join("\n");

function folder() {
  const dir = mkdtempSync(join(tmpdir(), "setup-"));
  writeFileSync(join(dir, ".env.example"), example);
  return {
    envPath: join(dir, ".env"),
    examplePath: join(dir, ".env.example"),
  };
}

test("a first run makes .env from the example, with secrets and local addresses", () => {
  const paths = folder();
  let n = 0;
  const result = runSetup({ ...paths, secret: () => `secret-${++n}` });
  const env = readFileSync(paths.envPath, "utf8");
  assert.equal(result.created, true);
  assert.equal(readValue(env, "SESSION_SECRET"), "secret-1");
  assert.equal(readValue(env, "DEMO_DESK_TOKEN"), "secret-2");
  assert.equal(readValue(env, "HOST"), "127.0.0.1");
  assert.equal(readValue(env, "PUBLIC_URL"), "http://localhost:8080");
  assert.equal(result.demoToken, "secret-2");
  assert.match(env, /^# Settings$/m);
  assert.equal(statSync(paths.envPath).mode & 0o777, 0o600);
});

test("a second run keeps the values that are there and fills only empty ones", () => {
  const paths = folder();
  writeFileSync(
    paths.envPath,
    "SESSION_SECRET=mine\nHOST=0.0.0.0\nDEMO_DESK_TOKEN=\nPORT=9090\n",
  );
  const result = runSetup({ ...paths, secret: () => "new" });
  const env = readFileSync(paths.envPath, "utf8");
  assert.equal(result.created, false);
  assert.deepEqual(result.filled, ["DEMO_DESK_TOKEN"]);
  assert.equal(readValue(env, "SESSION_SECRET"), "mine");
  assert.equal(readValue(env, "HOST"), "0.0.0.0");
  assert.equal(result.port, "9090");
});

test("a key that the file does not have is added at the end", () => {
  const { text, filled } = fillEmpty(
    "PORT=8080",
    { SESSION_SECRET: "s" },
    false,
  );
  assert.equal(text, "PORT=8080\nSESSION_SECRET=s");
  assert.deepEqual(filled, ["SESSION_SECRET"]);
});
